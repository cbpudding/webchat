import * as CBOR from "cbor"
import Express from "express"
import * as UUID from "uuid"
import * as WebSocket from "ws"

const app = Express()

app.get("/", (_, res) => {
	let path = __dirname.split("/")
	path.pop()
	res.sendFile(path.join("/") + "/nohttp.htm")
})

const wss = new WebSocket.Server({server: app.listen(5463)})

wss.on("connection", ws => {
	ws.last = Date.now()
	ws.nickname = "Anonymous"
	ws.rate = 10
	ws.refresh = 10
	ws.sanitize = true
	ws.uuid = UUID.v4()
	ws.on("message", (data: Buffer) => {
		var msg = CBOR.decodeAllSync(data)
		handleMessage(ws, msg)
	})
	ws.send(CBOR.encode({
		type: 0,
		guid: ws.uuid
	}))
})

/* Message Types
 * 0  - Outbound GUID
 * 1  - Inbound Message
 * 2  - Outbound Message
 * 3  - Inbound Private Message
 * 4  - Outbound Private Message
 * 5  - Disable Sanitization
 * 6  - Adjust Rate Limit(Unimplemented)
 * 7  - Change Nickname
 * 8  - Start Encryption(Unimplemented)
 * 9  - Outbound Ping
 * 10 - Inbound Pong
 */

// TODO: Restrict 2 connections per IP

function handleMessage(ws: any, msg: any) {
	switch(msg.type) {
	case 1:
		let content = typeof msg.content !== "undefined" ? msg.content : ""
		let smsg = {
			author: {
				guid: ws.uuid,
				nick: ws.nickname
			},
			content: content,
			type: 2
		}
		let umsg = msg
		umsg.author = {
			guid: ws.guid,
			nick: ws.nickname
		}
		umsg.content = content
		umsg.type = 2
		wss.clients.forEach((client: any) => {
			if(client.readyState === WebSocket.OPEN) {
				if(client.sanitize) {
					client.send(smsg)
				} else {
					client.send(umsg)
				}
			}
		})
		break
	case 3:
		if(typeof msg.recipient !== "undefined") {
			wss.clients.forEach((client: any) => {
				if(client.readyState !== WebSocket.OPEN) {
					if(client.uuid === msg.recipient) {
						let content = typeof msg.content !== "undefined" ? msg.content : ""
						if(client.sanitize) {
							client.send(CBOR.encode({
								type: 4,
								content: content,
								author: {
									guid: ws.uuid,
									nick: ws.nickname
								},
								recipient: msg.recipient
							}))
						} else {
							let emsg = msg
							emsg.type = 4
							emsg.content = content
							emsg.author = {
								guid: ws.uuid,
								nick: ws.nickname
							}
							emsg.recipient = msg.recipient
							client.send(CBOR.encode(emsg))
						}
					}
				}
			})
		}
		break
	case 5:
		ws.sanitize = true
		break
	case 6:
		break
	case 7:
		if(typeof msg.nick !== "undefined") {
			ws.nickname = msg.nick
		}
		break
	case 8:
		break
	case 10:
		ws.last = Date.now()
		break
	default:
		break
	}
}

function broadcastMessage(msg: any) {
	let data = CBOR.encode(msg)
	wss.clients.forEach((client: any) => {
		if(client.readyState === WebSocket.OPEN) {
			client.send(data)
		}
	})
}

var delay = 0

setInterval(() => {
	delay = (delay + 1) % 10
	switch(delay) {
	case 0:
		broadcastMessage({type: 9})
		break
	case 5:
		wss.clients.forEach((client: any) => {
			if(client.readyState === WebSocket.OPEN) {
				client.terminate()
			}
		})
		break
	}
}, 100)
