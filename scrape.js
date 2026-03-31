const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    TARGET_PROXIES: 100000,
    OUTPUT_FILE: 'proxy.txt'
};

// ============================================
// SOURCES (ditambahin biar cepet dapet 100k)
// ============================================
const PROXY_SOURCES = [
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt',
    'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
    'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt',
    'https://www.proxy-list.download/api/v1/get?type=http',
    'https://www.proxy-list.download/api/v1/get?type=https',
    'https://www.proxy-list.download/api/v1/get?type=socks4',
    'https://www.proxy-list.download/api/v1/get?type=socks5',
    'https://api.openproxylist.xyz/http.txt',
    'https://api.openproxylist.xyz/socks4.txt',
    'https://api.openproxylist.xyz/socks5.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/http.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/socks4.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/socks5.txt',
    'https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/http.txt',
    'https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/socks4.txt',
    'https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/socks5.txt',
    'https://raw.githubusercontent.com/almroot/proxylists/master/http.txt',
    'https://raw.githubusercontent.com/almroot/proxylists/master/https.txt',
    'https://raw.githubusercontent.com/almroot/proxylists/master/socks4.txt',
    'https://raw.githubusercontent.com/almroot/proxylists/master/socks5.txt',
    'https://raw.githubusercontent.com/UserUnknownFactor/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/UserUnknownFactor/Proxy-List/master/socks4.txt',
    'https://raw.githubusercontent.com/UserUnknownFactor/Proxy-List/master/socks5.txt',
];

class ProxyScraper {
    constructor() {
        this.proxySet = new Set(); // ANTI DUPLIKAT OTOMATIS
    }

    // Parse ke format IP:port doang
    parseProxy(line) {
        line = line.trim();
        if (!line) return null;

        // Langsung format ip:port
        const match = line.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
        if (match) {
            return `${match[1]}:${match[2]}`;
        }

        // Format ip port (spasi)
        const matchSpace = line.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\d+)$/);
        if (matchSpace) {
            return `${matchSpace[1]}:${matchSpace[2]}`;
        }

        // Format dengan protocol (http://ip:port)
        const matchProto = line.match(/(?:\w+:\/\/)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)/);
        if (matchProto) {
            return `${matchProto[1]}:${matchProto[2]}`;
        }

        return null;
    }

    async scrapeUrl(url) {
        try {
            console.log(`📡 Scraping: ${url.split('/')[2]}...`);
            
            const response = await axios.get(url, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            const lines = response.data.split('\n');
            let added = 0;

            for (const line of lines) {
                const proxy = this.parseProxy(line);
                if (proxy) {
                    // Set otomatis handle duplikat
                    if (!this.proxySet.has(proxy)) {
                        this.proxySet.add(proxy);
                        added++;
                        
                        if (this.proxySet.size >= CONFIG.TARGET_PROXIES) {
                            console.log(`\n🎉 TARGET ${CONFIG.TARGET_PROXIES} PROXY TERCAPAI!`);
                            return true;
                        }
                    }
                }
            }

            console.log(`✅ +${added} proxy (total: ${this.proxySet.size}/${CONFIG.TARGET_PROXIES})`);
            return false;

        } catch (error) {
            console.log(`❌ Gagal: ${url.split('/')[2]}`);
            return false;
        }
    }

    saveToFile() {
        const proxies = Array.from(this.proxySet);
        const filePath = path.join(__dirname, CONFIG.OUTPUT_FILE);
        
        // LANGSUNG SAVE FORMAT IP:PORT
        fs.writeFileSync(filePath, proxies.join('\n'));
        console.log(`\n💾 SAVED: ${proxies.length} proxy (format IP:PORT) ke ${CONFIG.OUTPUT_FILE}`);
        
        // Preview 5 proxy pertama
        console.log('\n📋 Preview 5 proxy pertama:');
        proxies.slice(0, 5).forEach(p => console.log(`   ${p}`));
    }

    async run() {
        console.log('🚀 PROXY SCRAPER');
        console.log(`🎯 Target: ${CONFIG.TARGET_PROXIES} proxy UNIK`);
        console.log(`📁 Output: ${CONFIG.OUTPUT_FILE} (format IP:PORT)`);
        console.log('='.repeat(60));
        
        const startTime = Date.now();
        
        for (const url of PROXY_SOURCES) {
            if (this.proxySet.size >= CONFIG.TARGET_PROXIES) break;
            
            const stop = await this.scrapeUrl(url);
            if (stop) break;
            
            await this.sleep(500);
        }
        
        this.saveToFile();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Total proxy UNIK: ${this.proxySet.size}`);
        console.log(`⏱️  Waktu: ${duration} detik`);
        
        if (this.proxySet.size < CONFIG.TARGET_PROXIES) {
            console.log(`\n⚠️  Cuma dapet ${this.proxySet.size}/${CONFIG.TARGET_PROXIES}`);
            console.log(`💡 Jalankan ulang atau tambah source sendiri`);
        } else {
            console.log(`\n🎉 SUCCESS! ${this.proxySet.size} proxy siap pakai di proxy.txt`);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

const scraper = new ProxyScraper();
scraper.run().catch(console.error);
