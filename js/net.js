/* net.js — thin PeerJS wrapper for 1-host / 1-guest rooms.
 * Uses the public PeerJS cloud broker for signaling; game traffic is a
 * direct WebRTC data connection between the two browsers.
 * Room ids are namespaced: uxs3-<CODE>. */
(function (global) {
  'use strict';

  /* ICE: public STUN + a free public TURN relay. The relay matters twice:
   * (1) two windows on the same machine/router can fail peer-to-peer
   *     (NAT hairpin / identical mDNS candidates) — the relay path works;
   * (2) guests behind strict/symmetric NATs (common on residential ISPs)
   *     often cannot connect STUN-only. */
  if (!global.__PEER_CONFIG) {
    global.__PEER_CONFIG = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
      }
    };
  }

  var PREFIX = 'uxs3-';
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function makeCode() {
    var s = '';
    for (var i = 0; i < 5; i++) s += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
    return s;
  }
  function libReady() { return typeof global.Peer === 'function'; }

  function wrap(peer, getConn, cbs) {
    return {
      peer: peer,
      send: function (obj) {
        var c = getConn();
        if (c && c.open) { try { c.send(obj); } catch (e) { /* ignore */ } }
      },
      isOpen: function () { var c = getConn(); return !!(c && c.open); },
      close: function () {
        try { var c = getConn(); if (c) c.close(); } catch (e) {}
        try { peer.destroy(); } catch (e) {}
      }
    };
  }

  function host(code, cbs) {
    if (!libReady()) { cbs.onError && cbs.onError('netplay library failed to load'); return null; }
    var peer, conn = null;
    try { peer = new global.Peer(PREFIX + code, global.__PEER_CONFIG || undefined); }
    catch (e) { cbs.onError && cbs.onError('could not start host: ' + e.message); return null; }
    peer.on('open', function () { cbs.onOpen && cbs.onOpen(code); });
    peer.on('connection', function (c) {
      if (conn && conn.open) { c.on('open', function () { c.close(); }); return; } // room full
      conn = c;
      conn.on('open', function () { cbs.onGuest && cbs.onGuest(); });
      conn.on('data', function (d) { cbs.onData && cbs.onData(d); });
      conn.on('close', function () { cbs.onClose && cbs.onClose(); });
      conn.on('error', function () { cbs.onClose && cbs.onClose(); });
      conn.on('iceStateChanged', function (st) {
        if ((st === 'disconnected' || st === 'failed' || st === 'closed') && !conn.open) cbs.onClose && cbs.onClose();
      });
    });
    peer.on('error', function (err) {
      var msg = err && err.type === 'unavailable-id'
        ? 'that room code is already in use — try again'
        : 'connection error (' + (err ? err.type : 'unknown') + ')';
      cbs.onError && cbs.onError(msg);
    });
    peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) {} });
    return wrap(peer, function () { return conn; }, cbs);
  }

  function join(code, cbs) {
    if (!libReady()) { cbs.onError && cbs.onError('netplay library failed to load'); return null; }
    var peer, conn = null;
    try { peer = new global.Peer(global.__PEER_CONFIG || undefined); }
    catch (e) { cbs.onError && cbs.onError('could not start: ' + e.message); return null; }
    peer.on('open', function () {
      conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', function () { cbs.onOpen && cbs.onOpen(code); });
      conn.on('data', function (d) { cbs.onData && cbs.onData(d); });
      conn.on('close', function () { cbs.onClose && cbs.onClose(); });
      conn.on('error', function (err) {
        // a failed attempt before the connection opens must be VISIBLE, not a silent hang
        if (!conn.open) { cbs.onError && cbs.onError('could not connect to the host' + (err && err.type ? ' (' + err.type + ')' : '') + ' — check the code, or try another browser/network'); }
        else cbs.onClose && cbs.onClose();
      });
      conn.on('iceStateChanged', function (st) {
        if ((st === 'disconnected' || st === 'failed' || st === 'closed') && !conn.open) {
          cbs.onError && cbs.onError('the connection to the host was blocked before it could start — this browser/network is likely blocking peer connections. Try a different browser or network.');
        }
      });
    });
    peer.on('error', function (err) {
      var msg = err && err.type === 'peer-unavailable'
        ? 'room not found — check the code, or the host may have left'
        : 'connection error (' + (err ? err.type : 'unknown') + ')';
      cbs.onError && cbs.onError(msg);
    });
    peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) {} });
    return wrap(peer, function () { return conn; }, cbs);
  }

  global.Net = { makeCode: makeCode, host: host, join: join, libReady: libReady };
})(typeof window !== 'undefined' ? window : globalThis);
