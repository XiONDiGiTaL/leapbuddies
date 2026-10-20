/* net.js — room transport over a WebSocket relay (Supabase Realtime
 * broadcast channels). Both browsers make ONE outbound WSS connection
 * to the relay — no peer negotiation, no ICE/NAT traversal — so joining
 * works in any modern browser and on any home network.
 *
 * Public interface (unchanged): Net.makeCode(), Net.host(code, cbs),
 * Net.join(code, cbs), Net.libReady(). Callbacks: onOpen, onGuest,
 * onData, onClose, onError. Returned handle: send(obj), isOpen(), close().
 * Rooms are channels named uxs3-<CODE>; app messages ride as broadcast
 * payloads tagged with the sender side. */
(function (global) {
  'use strict';

  var SB_URL = 'https://ezwxppiuxbyzmmheckce.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6d3hwcGl1eGJ5em1taGVja2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjE4MjEsImV4cCI6MjEwMzI5NzgyMX0.fh6AUpeKPDlm4Tr2xXwhf0VdKsRv1A1bZ2s4WFPDMaE';
  var PREFIX = 'uxs3-';
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function makeCode() {
    var s = '';
    for (var i = 0; i < 5; i++) s += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    return s;
  }
  function libReady() {
    return !!(global.supabase && typeof global.supabase.createClient === 'function' && SB_ANON.indexOf('__') !== 0);
  }
  function newClient() {
    return global.supabase.createClient(SB_URL, SB_ANON, {
      realtime: { params: { eventsPerSecond: 40 } }
    });
  }
  function wrap(client, channel, isOpenFn) {
    return {
      send: function (obj) {
        try {
          channel.send({ type: 'broadcast', event: 'msg', payload: obj });
        } catch (e) { /* channel closing */ }
      },
      isOpen: isOpenFn,
      close: function () {
        try { channel.untrack(); } catch (e) {}
        try { client.removeChannel(channel); } catch (e) {}
        try { client.realtime.disconnect(); } catch (e) {}
      }
    };
  }

  function host(code, cbs) {
    if (!libReady()) { cbs.onError && cbs.onError('netplay library failed to load'); return null; }
    var client = newClient();
    var guestKey = null;          // presence key of the locked-in guest
    var guestGid = null;          // guest session id (message filter)
    var opened = false;
    var channel = client.channel(PREFIX + code, {
      config: { broadcast: { self: false }, presence: { key: 'host-' + Math.random().toString(36).slice(2, 9) } }
    });

    channel.on('presence', { event: 'sync' }, function () {
      var st = channel.presenceState();
      var guestPresent = false;
      Object.keys(st).forEach(function (k) { if (k.indexOf('guest-') === 0) guestPresent = true; });
      if (guestPresent && !guestKey) { guestKey = 'seen'; cbs.onGuest && cbs.onGuest(); }
      if (!guestPresent && guestKey) { guestKey = null; guestGid = null; cbs.onClose && cbs.onClose(); }
    });
    channel.on('broadcast', { event: 'msg' }, function (m) {
      var d = m && m.payload;
      if (!d || d.__from !== 'guest') return;
      if (guestGid && d.__gid !== guestGid) return;      // room locked to first guest
      if (!guestGid && (d.t === 'hello' || d.t === 'pick')) guestGid = d.__gid || null;
      if (!guestKey) { guestKey = 'seen'; cbs.onGuest && cbs.onGuest(); }
      cbs.onData && cbs.onData(d);
    });

    channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        channel.track({ role: 'host' });
        if (!opened) { opened = true; cbs.onOpen && cbs.onOpen(code); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        cbs.onError && cbs.onError('could not reach the session relay — check your connection and try again');
      }
    });

    var handle = wrap(client, channel, function () { return !!guestKey; });
    var rawSend = handle.send;
    handle.send = function (obj) { obj.__from = 'host'; rawSend(obj); };
    return handle;
  }

  function join(code, cbs) {
    if (!libReady()) { cbs.onError && cbs.onError('netplay library failed to load'); return null; }
    var client = newClient();
    var gid = 'g' + Math.random().toString(36).slice(2, 10);
    var myKey = 'guest-' + gid;
    var opened = false;
    var hostSeen = false;
    var channel = client.channel(PREFIX + code, {
      config: { broadcast: { self: false }, presence: { key: myKey } }
    });

    var notFoundTimer = setTimeout(function () {
      if (!opened) cbs.onError && cbs.onError('room not found — check the code, or the host may have left');
    }, 12000);

    function hostPresence() {
      var st = channel.presenceState();
      return Object.keys(st).some(function (k) { return k.indexOf('host-') === 0; });
    }
    channel.on('presence', { event: 'sync' }, function () {
      var has = hostPresence();
      if (has && !hostSeen) {
        hostSeen = true;
        clearTimeout(notFoundTimer);
        if (!opened) { opened = true; cbs.onOpen && cbs.onOpen(code); }
      }
      if (!has && hostSeen) { hostSeen = false; cbs.onClose && cbs.onClose(); }
    });
    channel.on('broadcast', { event: 'msg' }, function (m) {
      var d = m && m.payload;
      if (!d || d.__from !== 'host') return;
      if (!hostSeen) {
        hostSeen = true;
        clearTimeout(notFoundTimer);
        if (!opened) { opened = true; cbs.onOpen && cbs.onOpen(code); }
      }
      cbs.onData && cbs.onData(d);
    });

    channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        channel.track({ role: 'guest' });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(notFoundTimer);
        cbs.onError && cbs.onError('could not reach the session relay — check your connection and try again');
      }
    });

    var handle = wrap(client, channel, function () { return opened; });
    var rawSend = handle.send;
    handle.send = function (obj) { obj.__from = 'guest'; obj.__gid = gid; rawSend(obj); };
    return handle;
  }

  global.Net = { makeCode: makeCode, host: host, join: join, libReady: libReady };
})(typeof window !== 'undefined' ? window : globalThis);
