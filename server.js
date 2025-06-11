import axios from "axios";
import { WebSocketServer } from "ws";
import { Zalo, ThreadType, Urgency, TextStyle } from "zca-js";

async function getLocation(ip = "113.178.136.50") {
    if (ip == "ERROR")
        return ip;

    try {
        const response = await axios.get(`https://freeipapi.com/api/json/${ip}`);
        return response.data.regionName;
    } catch (error) {
        console.error("Error fetching location:", error.message);
    }
}

async function main() {
    const zalo = new Zalo({
        selfListen: false
    });
    const zaloClient = await zalo.login({
        cookie: [{"domain":".zalo.me","expirationDate":1783351176.862249,"hostOnly":false,"httpOnly":false,"name":"__zi","path":"/","sameSite":"no_restriction","secure":true,"session":false,"storeId":"0","value":"3000.SSZzejyD7D4ecRUgqn5LsYBOiwdR7HgNFvQziPX129rnsh-trmm8ct3TjVlL3GJGSDktzT0A0Tuu.1"},{"domain":".zalo.me","expirationDate":1783351176.862393,"hostOnly":false,"httpOnly":false,"name":"__zi-legacy","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"3000.SSZzejyD7D4ecRUgqn5LsYBOiwdR7HgNFvQziPX129rnsh-trmm8ct3TjVlL3GJGSDktzT0A0Tuu.1"},{"domain":".zalo.me","expirationDate":1749072721.712259,"hostOnly":false,"httpOnly":false,"name":"_zlang","path":"/","sameSite":"unspecified","secure":true,"session":false,"storeId":"0","value":"vn"},{"domain":".zalo.me","expirationDate":1780522310.80604,"hostOnly":false,"httpOnly":true,"name":"zpsid","path":"/","sameSite":"no_restriction","secure":true,"session":false,"storeId":"0","value":"z_eL.438008240.20.kgDjUtWj9MV8L3vzT2qbPmrULrDB5HLNG1yHLtQTlB96BF4tUUjCM10j9MS"},{"domain":".chat.zalo.me","expirationDate":1749591111.053603,"hostOnly":false,"httpOnly":true,"name":"zpw_sek","path":"/","sameSite":"lax","secure":true,"session":false,"storeId":"0","value":"Yx1-.438008240.a0.FajLRzM9YDzby9F5z8c8twwhxRJtiwgHujhmcvF6swgj-SxelEhRgfV6fvkKjBNzg8SuHW2tYGk5Y4wswk68tm"},{"domain":".zalo.me","expirationDate":1749159122.81979,"hostOnly":false,"httpOnly":true,"name":"app.event.zalo.me","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"885404328801265856"}],
        imei: "5c8113d0-2b65-4dac-96e5-ec811f1dcca5-8b2bf32448aaaa1415d4b0b61938828d",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0",
    });
    const familyThreadID = "3682819023050305764";
    zaloClient.listener.start();

    const socketServer = new WebSocketServer({ port: 8070 });

    const lastSentTime = {
        "THRESHOLD": 0
    };

    var state = 0;
    var ledState = 0;
    var buzzerState = 0;
    var thresholdLevel = 18;
    var location = "";

    const RATE_LIMIT_MS = 5000;

    socketServer.on("connection", (socket) => {
        console.log("Client connected");

        socketServer.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send("NEW_DEVICE");
            }
        });

        socket.on("message", async (data) => {
            const message = data.toString();
            const args = message.split("|");
            let notification = null;

            console.log("Received:", message);
            const now = Date.now();

            switch (message) {
                case "CIRCUIT_DEVICE_CONNECTED":
                case "MOBILE_DEVICE_CONNECTED":
                    socket.send("SYNC_STATE|" + state);
                    socket.send("SYNC_LED|" + ledState);
                    socket.send("SYNC_BUZZER|" + buzzerState);
                    socket.send("SYNC_THRESHOLD_LEVEL|" + thresholdLevel);
                    socket.send("SYNC_LOCATION|" + location);
                    break;
                case "ON_LED":
                    ledState = 1;
                    break;
                case "OFF_LED":
                    ledState = 0;
                    break;
                case "ON_SOUND":
                    buzzerState = 1;
                    break;
                case "OFF_SOUND":
                    buzzerState = 0;
                    break;
                case "THRESHOLD":
                    if (now - lastSentTime[message] >= RATE_LIMIT_MS && state == 1) {
                        notification = "Phương tiện đã bị va chạm mạnh";
                        lastSentTime[message] = now;

                        socketServer.clients.forEach((client) => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send("VEHICLE_COLLISION");
                                // client.send("ON_SOUND");
                            }
                        });
                    }
                    break;
                default:
                    if (args.length == 2) {
                        switch (args[0]) {
                            case "STATE":
                                state = parseInt(args[1]);
                                break;
                            case "THRESHOLD_LEVEL":
                                thresholdLevel = parseInt(args[1]);
                                break;
                            case "CIRCUIT_IP":
                                location = await getLocation(args[1]);
                                if (location != undefined && location != "" && location != "ERROR")
                                    socket.send("SYNC_LOCATION|" + location);
                                break;
                            default:
                                break;
                        }
                    }
                    break;
            }

            if (notification != null) {
                console.log("Sent: " + notification);
                zaloClient.sendMessage({
                    msg: notification,
                    urgency: Urgency.Important,
                    styles: [
                        { start: 0, len: notification.length, st: TextStyle.Bold },
                        { start: 0, len: notification.length, st: TextStyle.Red },
                        { start: 0, len: notification.length, st: TextStyle.Big }
                    ]
                }, familyThreadID, 1);
            }

            socketServer.clients.forEach((client) => {
                if (client !== socket && client.readyState === client.OPEN) {
                    client.send(message);
                }
            });
        });

        socket.on("close", () => {
            socketServer.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send("CLIENT_DISCONNECTED");
                }
            });
        });
    });
}

main();
