const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');

// Warna untuk output console
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    magenta: '\x1b[35m'
};

// Baca User Agents dari file ua.txt
let userAgents = [];
try {
    const uaFile = fs.readFileSync('ua.txt', 'utf-8');
    userAgents = uaFile.toString().split(/\r?\n/).filter(line => line.trim());
    if (userAgents.length === 0) {
        console.log(`${colors.red}⚠️  ua.txt kosong! Gunakan user agents default.${colors.reset}`);
        userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ];
    }
} catch (err) {
    console.log(`${colors.yellow}⚠️  File ua.txt tidak ditemukan! Gunakan user agents default.${colors.reset}`);
    userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ];
}

// Global stats
let stats = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    statusCodes: {},
    responseTimes: [],
    errors: {},
    userAgentStats: new Map()
};

let isRunning = true;
let targetUrl = '';
let parsedUrl = null;
let protocol = null;

function getStatusColor(statusCode) {
    if (statusCode >= 200 && statusCode < 300) return colors.green;
    if (statusCode >= 300 && statusCode < 400) return colors.cyan;
    if (statusCode >= 400 && statusCode < 500) return colors.yellow;
    if (statusCode >= 500) return colors.red;
    return colors.white;
}

function makeRequest(userAgent, requestId) {
    return new Promise((resolve) => {
        if (!isRunning) {
            resolve(null);
            return;
        }

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.path || '/',
            method: 'GET',
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'close'
            },
            timeout: 10000
        };

        const startTime = Date.now();
        const request = protocol.request(options, (response) => {
            const responseTime = Date.now() - startTime;

            let body = '';
            response.on('data', (chunk) => {
                body += chunk;
            });

            response.on('end', () => {
                resolve({
                    success: response.statusCode >= 200 && response.statusCode < 400,
                    statusCode: response.statusCode,
                    responseTime: responseTime,
                    userAgent: userAgent
                });
            });
        });

        request.on('error', (error) => {
            resolve({
                success: false,
                statusCode: null,
                responseTime: Date.now() - startTime,
                userAgent: userAgent,
                error: error.message
            });
        });

        request.on('timeout', () => {
            request.destroy();
            resolve({
                success: false,
                statusCode: null,
                responseTime: Date.now() - startTime,
                userAgent: userAgent,
                error: 'Timeout'
            });
        });

        request.end();
    });
}

async function runTest(threadId, duration, ratePerSecond) {
    const delayMs = 1000 / ratePerSecond;
    const startTime = Date.now();
    let requestCounter = 0;

    console.log(`${colors.blue}[Thread ${threadId}]${colors.reset} Started with ${ratePerSecond} req/sec`);

    while (isRunning && (Date.now() - startTime) < duration * 1000) {
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        const result = await makeRequest(userAgent, `${threadId}_${requestCounter}`);

        if (result) {
            // Update stats (thread-safe via cluster messaging)
            process.send({
                type: 'stats',
                data: result
            });

            // Log setiap 50 request
            if (requestCounter % 50 === 0 && requestCounter > 0) {
                console.log(`${colors.blue}[Thread ${threadId}]${colors.reset} Sent ${requestCounter} requests`);
            }

            requestCounter++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    console.log(`${colors.blue}[Thread ${threadId}]${colors.reset} ${colors.green}Finished${colors.reset} - Total: ${requestCounter} requests`);
    process.send({ type: 'done', threadId });
}

function printStats() {
    const avgResponseTime = stats.responseTimes.length > 0
        ? (stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length).toFixed(0)
        : 0;

    const minResponseTime = stats.responseTimes.length > 0
        ? Math.min(...stats.responseTimes)
        : 0;

    const maxResponseTime = stats.responseTimes.length > 0
        ? Math.max(...stats.responseTimes)
        : 0;

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.white}📊 FINAL STATISTICS${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.white}🎯 Target: ${colors.yellow}${targetUrl}${colors.reset}`);
    console.log(`${colors.white}📊 Total Requests: ${colors.magenta}${stats.totalRequests}${colors.reset}`);
    console.log(`${colors.green}✅ Successful: ${stats.successRequests}${colors.reset}`);
    console.log(`${colors.red}❌ Failed: ${stats.failedRequests}${colors.reset}`);
    console.log(`${colors.white}📈 Success Rate: ${colors.cyan}${((stats.successRequests / stats.totalRequests) * 100).toFixed(2)}%${colors.reset}`);
    console.log(`${colors.white}⏱️  Avg Response Time: ${colors.yellow}${avgResponseTime}ms${colors.reset}`);
    console.log(`${colors.white}⏱️  Min Response Time: ${colors.green}${minResponseTime}ms${colors.reset}`);
    console.log(`${colors.white}⏱️  Max Response Time: ${colors.red}${maxResponseTime}ms${colors.reset}`);

    // Status Codes Distribution
    console.log(`\n${colors.white}📋 Status Codes Distribution:${colors.reset}`);
    const sortedCodes = Object.entries(stats.statusCodes).sort((a, b) => a[0] - b[0]);
    for (const [code, count] of sortedCodes) {
        const statusColor = getStatusColor(parseInt(code));
        const percentage = ((count / stats.totalRequests) * 100).toFixed(2);
        const barLength = Math.floor((count / stats.totalRequests) * 50);
        const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength);
        console.log(`  ${statusColor}${code}${colors.reset}: ${count} kali (${percentage}%)`);
        console.log(`  ${colors.cyan}[${bar}]${colors.reset}`);
    }

    // Error Distribution
    if (Object.keys(stats.errors).length > 0) {
        console.log(`\n${colors.red}❌ Error Distribution:${colors.reset}`);
        for (const [error, count] of Object.entries(stats.errors)) {
            console.log(`  ${colors.red}${error}${colors.reset}: ${count} kali`);
        }
    }

    // Best and Worst User Agents
    const uaSuccess = new Map();
    const uaTotal = new Map();

    for (const [ua, data] of stats.userAgentStats) {
        const successRate = (data.success / data.total) * 100;
        const avgTime = data.totalTime / data.total;

        if (!uaSuccess.has(ua) || successRate > uaSuccess.get(ua).rate) {
            uaSuccess.set(ua, { rate: successRate, avgTime: avgTime, total: data.total });
        }
    }

    if (uaSuccess.size > 0) {
        console.log(`\n${colors.green}✅ BEST USER AGENTS (by success rate):${colors.reset}`);
        const sorted = Array.from(uaSuccess.entries())
            .sort((a, b) => b[1].rate - a[1].rate)
            .slice(0, 5);

        sorted.forEach(([ua, data]) => {
            console.log(`  ${colors.green}[${data.rate.toFixed(2)}%]${colors.reset} ${ua.substring(0, 70)}... ${colors.yellow}(${data.avgTime.toFixed(0)}ms avg)${colors.reset}`);
        });
    }

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

// Cluster master
if (cluster.isMaster) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log(`\n${colors.yellow}Usage: node test.js <URL> <DURATION> <THREADS> [RATE_PER_SECOND]${colors.reset}`);
        console.log(`\n${colors.white}Parameters:${colors.reset}`);
        console.log(`  ${colors.cyan}URL${colors.reset}              - Target URL (contoh: https://example.com)`);
        console.log(`  ${colors.cyan}DURATION${colors.reset}         - Durasi test dalam detik (contoh: 30)`);
        console.log(`  ${colors.cyan}THREADS${colors.reset}          - Jumlah thread/worker (contoh: 4)`);
        console.log(`  ${colors.cyan}RATE_PER_SECOND${colors.reset}   - Request per second per thread (default: 1)`);
        console.log(`\n${colors.white}Examples:${colors.reset}`);
        console.log(`  node test.js https://example.com 30 4`);
        console.log(`  node test.js https://example.com 60 8 5`);
        console.log(`  node test.js http://localhost:3000 10 2`);
        console.log(`\n${colors.white}File required:${colors.reset}`);
        console.log(`  ${colors.cyan}ua.txt${colors.reset} - File berisi daftar User Agent (satu baris satu UA)`);
        console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);
        process.exit(1);
    }

    targetUrl = args[0];
    const duration = parseInt(args[1]);
    const threads = parseInt(args[2]);
    const ratePerSecond = args[3] ? parseInt(args[3]) : 1;

    // Parse URL
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }
    parsedUrl = url.parse(targetUrl);
    protocol = parsedUrl.protocol === 'https:' ? https : http;

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.white}🚀 USER AGENT TESTER WITH MULTI-THREADING${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.white}🎯 Target URL: ${colors.yellow}${targetUrl}${colors.reset}`);
    console.log(`${colors.white}⏱️  Duration: ${colors.yellow}${duration} seconds${colors.reset}`);
    console.log(`${colors.white}🧵 Threads: ${colors.yellow}${threads}${colors.reset}`);
    console.log(`${colors.white}⚡ Rate: ${colors.yellow}${ratePerSecond} req/sec/thread${colors.reset}`);
    console.log(`${colors.white}📊 Total RPS: ${colors.magenta}${threads * ratePerSecond} requests/second${colors.reset}`);
    console.log(`${colors.white}👥 User Agents: ${colors.green}${userAgents.length} different UAs${colors.reset}`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

    // Fork workers
    for (let i = 1; i <= threads; i++) {
        cluster.fork();
    }

    let completedWorkers = 0;

    // Handle messages from workers
    for (const id in cluster.workers) {
        cluster.workers[id].on('message', (msg) => {
            if (msg.type === 'stats') {
                stats.totalRequests++;
                if (msg.data.success) {
                    stats.successRequests++;
                } else {
                    stats.failedRequests++;
                }

                if (msg.data.statusCode) {
                    stats.statusCodes[msg.data.statusCode] = (stats.statusCodes[msg.data.statusCode] || 0) + 1;
                }

                if (msg.data.responseTime) {
                    stats.responseTimes.push(msg.data.responseTime);
                }

                if (msg.data.error) {
                    stats.errors[msg.data.error] = (stats.errors[msg.data.error] || 0) + 1;
                }

                // Store user agent stats
                if (!stats.userAgentStats.has(msg.data.userAgent)) {
                    stats.userAgentStats.set(msg.data.userAgent, { total: 0, success: 0, totalTime: 0 });
                }
                const uaStat = stats.userAgentStats.get(msg.data.userAgent);
                uaStat.total++;
                if (msg.data.success) uaStat.success++;
                if (msg.data.responseTime) uaStat.totalTime += msg.data.responseTime;

                // Live stats setiap 100 requests
                if (stats.totalRequests % 100 === 0) {
                    console.log(`${colors.green}[LIVE]${colors.reset} Total: ${stats.totalRequests} | Success: ${stats.successRequests} | Failed: ${stats.failedRequests} | Rate: ${((stats.successRequests / stats.totalRequests) * 100).toFixed(2)}%`);
                }
            } else if (msg.type === 'done') {
                completedWorkers++;
                if (completedWorkers === threads) {
                    printStats();
                    process.exit(0);
                }
            }
        });
    }

    // Stop after duration
    setTimeout(() => {
        isRunning = false;
        console.log(`\n${colors.yellow}⏹️  Stopping test after ${duration} seconds...${colors.reset}`);

        // Force exit after 5 seconds if workers don't finish
        setTimeout(() => {
            console.log(`${colors.red}Force exiting...${colors.reset}`);
            process.exit(0);
        }, 5000);
    }, duration * 1000);

} else {
    // Worker
    const args = process.argv.slice(2);
    const duration = parseInt(args[1]);
    const ratePerSecond = args[3] ? parseInt(args[3]) : 1;
    const threadId = cluster.worker.id;

    targetUrl = args[0];
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }
    parsedUrl = url.parse(targetUrl);
    protocol = parsedUrl.protocol === 'https:' ? https : http;

    runTest(threadId, duration, ratePerSecond);
}