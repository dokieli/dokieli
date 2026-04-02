#!/usr/bin/env node
/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Minimal y-websocket server for e2e tests.
 * No origin/room validation — accepts any connection on any room.
 * Use only in test environments.
 *
 * Usage:
 *   PORT=4000 node tests/utils/ws-server.js
 */

import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as map from 'lib0/map'
import * as number from 'lib0/number'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const WebSocketServer = WebSocket.Server
import http from 'http'

const host = process.env.HOST || 'localhost'
const port = number.parseInt(process.env.PORT || '4000')

const messageSync = 0
const messageAwareness = 1

const docs = new Map()

const send = (doc, conn, m) => {
  if (conn.readyState !== WebSocket.CONNECTING && conn.readyState !== WebSocket.OPEN) {
    closeConn(doc, conn)
    return
  }
  try {
    conn.send(m, err => { if (err != null) closeConn(doc, conn) })
  } catch (_e) {
    closeConn(doc, conn)
  }
}

const closeConn = (doc, conn) => {
  if (!doc.conns.has(conn)) return
  const controlledIds = doc.conns.get(conn)
  doc.conns.delete(conn)
  awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null)
  if (doc.conns.size === 0) {
    doc.destroy()
    docs.delete(doc.name)
  }
  conn.close()
}

const messageListener = (conn, doc, message) => {
  try {
    const encoder = encoding.createEncoder()
    const decoder = decoding.createDecoder(new Uint8Array(message))
    const messageType = decoding.readVarUint(decoder)
    switch (messageType) {
      case messageSync:
        encoding.writeVarUint(encoder, messageSync)
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn)
        if (encoding.length(encoder) > 1) send(doc, conn, encoding.toUint8Array(encoder))
        break
      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn)
        break
    }
  } catch (err) {
    console.error('[ws] message error:', err)
    doc.emit('error', [err])
  }
}

class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true })
    this.name = name
    this.conns = new Map()
    this.awareness = new awarenessProtocol.Awareness(this)
    this.awareness.setLocalState(null)

    this.awareness.on('update', ({ added, updated, removed }, conn) => {
      const changed = added.concat(updated, removed)
      if (conn !== null) {
        const ids = this.conns.get(conn)
        if (ids) {
          added.forEach(id => ids.add(id))
          removed.forEach(id => ids.delete(id))
        }
      }
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageAwareness)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed))
      const buf = encoding.toUint8Array(encoder)
      this.conns.forEach((_, c) => send(this, c, buf))
    })

    this.on('update', (update, _origin) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageSync)
      syncProtocol.writeUpdate(encoder, update)
      const buf = encoding.toUint8Array(encoder)
      this.conns.forEach((_, c) => send(this, c, buf))
    })
  }
}

const getYDoc = (docName) =>
  map.setIfUndefined(docs, docName, () => new WSSharedDoc(docName))

const setupWSConnection = (conn, req) => {
  const docName = (req.url || '').split('?')[0].split('/').pop()
  conn.binaryType = 'arraybuffer'
  const doc = getYDoc(docName)
  doc.conns.set(conn, new Set())

  conn.on('message', msg => messageListener(conn, doc, msg))
  conn.on('close', () => closeConn(doc, conn))

  // Sync step 1: send our state vector
  {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeSyncStep1(encoder, doc)
    send(doc, conn, encoding.toUint8Array(encoder))
  }
  // Send current awareness states
  const states = doc.awareness.getStates()
  if (states.size > 0) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(states.keys())))
    send(doc, conn, encoding.toUint8Array(encoder))
  }
}

const wss = new WebSocketServer({ noServer: true })
wss.on('connection', setupWSConnection)

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('ok')
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request))
})

server.listen(port, host, () => {
  console.log(`[ws-test] running at ws://${host}:${port}`)
})
