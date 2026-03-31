const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    TARGET_PROXIES: 100000,
    OUTPUT_FILE: 'proxy.txt'
};

// ============================================
// SOURCES (ditambahin biar cepet dapet 100k)
// ============================================const PROXY_SOURCES = [
    // ============================================
    // 1. PROXYSCRAPE API (Paling Reliable)
    // ============================================
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=elite',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=yes&anonymity=all',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=https&timeout=10000&country=all&ssl=all&anonymity=all',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all',
    'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all',
    'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all',
    'https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks4&timeout=10000&country=all',
    'https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=10000&country=all',
    
    // ============================================
    // 2. GITHUB RAW LISTS (Updated Rutin)
    // ============================================
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/https.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt',
    'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
    'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTP_RAW.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/http.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/https.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/socks4.txt',
    'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/socks5.txt',
    'https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/http.txt',
    'https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/https.txt',
    'https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/socks4.txt',
    'https://raw.githubusercontent.com/saschazesiger/Free-Proxies/master/proxies/socks5.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/https.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.txt',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.txt',
    'https://raw.githubusercontent.com/almroot/proxylists/master/http.txt',
    'https://raw.githubusercontent.com/almroot/proxylists/master/https.txt',
    'https://raw.githubusercontent.com/almroot/proxylists/master/socks4.txt',
    'https://raw.githubusercontent.com/almroot/proxylists/master/socks5.txt',
    'https://raw.githubusercontent.com/UserUnknownFactor/Proxy-List/main/http.txt',
    'https://raw.githubusercontent.com/UserUnknownFactor/Proxy-List/main/https.txt',
    'https://raw.githubusercontent.com/UserUnknownFactor/Proxy-List/main/socks4.txt',
    'https://raw.githubusercontent.com/UserUnknownFactor/Proxy-List/main/socks5.txt',
    'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_lists/HTTP.txt',
    'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_lists/HTTPS.txt',
    'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_lists/SOCKS4.txt',
    'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_lists/SOCKS5.txt',
    'https://raw.githubusercontent.com/offshoreproxies/proxies/main/http.txt',
    'https://raw.githubusercontent.com/offshoreproxies/proxies/main/https.txt',
    'https://raw.githubusercontent.com/offshoreproxies/proxies/main/socks4.txt',
    'https://raw.githubusercontent.com/offshoreproxies/proxies/main/socks5.txt',
    
    // ============================================
    // 3. PROXY-LIST.DOWNLOAD API
    // ============================================
    'https://www.proxy-list.download/api/v1/get?type=http',
    'https://www.proxy-list.download/api/v1/get?type=https',
    'https://www.proxy-list.download/api/v1/get?type=socks4',
    'https://www.proxy-list.download/api/v1/get?type=socks5',
    'https://www.proxy-list.download/api/v1/get?type=http&anon=elite',
    'https://www.proxy-list.download/api/v1/get?type=http&anon=anonymous',
    'https://www.proxy-list.download/api/v1/get?type=http&anon=transparent',
    'https://www.proxy-list.download/api/v1/get?type=https&anon=elite',
    'https://www.proxy-list.download/api/v1/get?type=socks4&anon=elite',
    'https://www.proxy-list.download/api/v1/get?type=socks5&anon=elite',
    
    // ============================================
    // 4. OPENPROXYLIST.XYZ
    // ============================================
    'https://api.openproxylist.xyz/http.txt',
    'https://api.openproxylist.xyz/https.txt',
    'https://api.openproxylist.xyz/socks4.txt',
    'https://api.openproxylist.xyz/socks5.txt',
    'https://openproxy.space/list/http',
    'https://openproxy.space/list/https',
    'https://openproxy.space/list/socks4',
    'https://openproxy.space/list/socks5',
    
    // ============================================
    // 5. PROXY LIST PLUS
    // ============================================
    'https://list.proxylistplus.com/HTTP_Proxy_List.txt',
    'https://list.proxylistplus.com/HTTPS_Proxy_List.txt',
    'https://list.proxylistplus.com/SOCKS4_Proxy_List.txt',
    'https://list.proxylistplus.com/SOCKS5_Proxy_List.txt',
    
    // ============================================
    // 6. FREE-PROXY-LIST.NET
    // ============================================
    'https://free-proxy-list.net/',
    'https://free-proxy-list.net/anonymous-proxy.html',
    'https://free-proxy-list.net/uk-proxy.html',
    'https://free-proxy-list.net/web-proxy.html',
    'https://www.free-proxy-list.com/',
    'https://www.freeproxylists.net/',
    
    // ============================================
    // 7. SSL PROXIES
    // ============================================
    'https://sslproxies.org/',
    'https://us-proxy.org/',
    'https://socks-proxy.net/',
    
    // ============================================
    // 8. PROXY SCRAPE API (Alternate)
    // ============================================
    'https://scrape.proxyscrape.com/?request=displayproxies&proxytype=http',
    'https://scrape.proxyscrape.com/?request=displayproxies&proxytype=https',
    'https://scrape.proxyscrape.com/?request=displayproxies&proxytype=socks4',
    'https://scrape.proxyscrape.com/?request=displayproxies&proxytype=socks5',
    
    // ============================================
    // 9. GITHUB PROXY LISTS (Lainnya)
    // ============================================
    'https://raw.githubusercontent.com/fate0/proxylist/master/proxy.list',
    'https://raw.githubusercontent.com/opsxcq/proxy-list/master/list.txt',
    'https://raw.githubusercontent.com/gitgad/proxy/main/http.txt',
    'https://raw.githubusercontent.com/gitgad/proxy/main/https.txt',
    'https://raw.githubusercontent.com/gitgad/proxy/main/socks4.txt',
    'https://raw.githubusercontent.com/gitgad/proxy/main/socks5.txt',
    'https://raw.githubusercontent.com/mertguvencli/http-proxy-list/main/proxy-list/data.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/https.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt',
    'https://raw.githubusercontent.com/proxylist-to/proxy-list/main/http.txt',
    'https://raw.githubusercontent.com/proxylist-to/proxy-list/main/https.txt',
    'https://raw.githubusercontent.com/proxylist-to/proxy-list/main/socks4.txt',
    'https://raw.githubusercontent.com/proxylist-to/proxy-list/main/socks5.txt',
    'https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt',
    'https://raw.githubusercontent.com/zloi-user/hideip.me/main/https.txt',
    'https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks4.txt',
    'https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt',
    
    // ============================================
    // 10. PUBPROXY.LIST
    // ============================================
    'https://pubproxy.com/api/proxy?limit=50&format=txt&http=true',
    'https://pubproxy.com/api/proxy?limit=50&format=txt&https=true',
    'https://pubproxy.com/api/proxy?limit=50&format=txt&socks4=true',
    'https://pubproxy.com/api/proxy?limit=50&format=txt&socks5=true',
    
    // ============================================
    // 11. PROXYNOVA
    // ============================================
    'https://www.proxynova.com/export/proxy_list.txt',
    'https://www.proxynova.com/export/socks4_list.txt',
    'https://www.proxynova.com/export/socks5_list.txt',
    
    // ============================================
    // 12. PROXYDB.NET
    // ============================================
    'https://proxydb.net/?protocol=http&anonymity=all&ssl=all&offset=0&limit=1000&format=text',
    'https://proxydb.net/?protocol=https&anonymity=all&ssl=all&offset=0&limit=1000&format=text',
    'https://proxydb.net/?protocol=socks4&anonymity=all&ssl=all&offset=0&limit=1000&format=text',
    'https://proxydb.net/?protocol=socks5&anonymity=all&ssl=all&offset=0&limit=1000&format=text',
    
    // ============================================
    // 13. PROXYWEBS
    // ============================================
    'https://proxywebs.com/proxy/list/http',
    'https://proxywebs.com/proxy/list/https',
    'https://proxywebs.com/proxy/list/socks4',
    'https://proxywebs.com/proxy/list/socks5',
    
    // ============================================
    // 14. RAW PROXY LISTS (Misc)
    // ============================================
    'https://raw.githubusercontent.com/volkandindar/proxy-list/main/proxy-list.txt',
    'https://raw.githubusercontent.com/volkandindar/proxy-list/main/socks4-list.txt',
    'https://raw.githubusercontent.com/volkandindar/proxy-list/main/socks5-list.txt',
    'https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/http.txt',
    'https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/https.txt',
    'https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks4.txt',
    'https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt',
    'https://raw.githubusercontent.com/hendrikginting/proxy-scrapper/main/proxy_list.txt',
    
    // ============================================
    // 15. FOXPROXY
    // ============================================
    'https://foxproxy.net/proxy-list/http',
    'https://foxproxy.net/proxy-list/https',
    'https://foxproxy.net/proxy-list/socks4',
    'https://foxproxy.net/proxy-list/socks5',
    
    // ============================================
    // 16. HIDEMY.NAME
    // ============================================
    'https://hidemy.name/en/proxy-list/?list=443&type=h#list',
    'https://hidemy.name/en/proxy-list/?list=8080&type=h#list',
    'https://hidemy.name/en/proxy-list/?list=3128&type=h#list',
    
    // ============================================
    // 17. CHECKERPROXY
    // ============================================
    'https://checkerproxy.net/api/archive/',
    'https://checkerproxy.net/api/archive/latest',
    
    // ============================================
    // 18. PROXY LIST ME
    // ============================================
    'https://www.proxy-list.me/api/get.php?type=http',
    'https://www.proxy-list.me/api/get.php?type=https',
    'https://www.proxy-list.me/api/get.php?type=socks4',
    'https://www.proxy-list.me/api/get.php?type=socks5',
    
    // ============================================
    // 19. GATHERPROXY
    // ============================================
    'https://gatherproxy.com/proxylist/anonymity/?t=elite',
    'https://gatherproxy.com/proxylist/anonymity/?t=anonymous',
    'https://gatherproxy.com/proxylist/country/?c=UnitedStates',
    
    // ============================================
    // 20. PROXYSCRAPE.IO
    // ============================================
    'https://proxy-scrape.com/proxy-list',
    'https://proxy-scrape.com/proxy-list/socks4',
    'https://proxy-scrape.com/proxy-list/socks5',
    
    // ============================================
    // 21. ADDITIONAL RAW GITHUB SOURCES
    // ============================================
    'https://raw.githubusercontent.com/mahesh-nikam/proxy-list/main/Proxy-List/http.txt',
    'https://raw.githubusercontent.com/mahesh-nikam/proxy-list/main/Proxy-List/https.txt',
    'https://raw.githubusercontent.com/mahesh-nikam/proxy-list/main/Proxy-List/socks4.txt',
    'https://raw.githubusercontent.com/mahesh-nikam/proxy-list/main/Proxy-List/socks5.txt',
    'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
    'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.json',
    'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/http.txt',
    'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/https.txt',
    'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/socks4.txt',
    'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/socks5.txt',
    'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt',
    'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/https.txt',
    'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt',
    'https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt',
    'https://raw.githubusercontent.com/webfansplz/proxy-list/main/http.txt',
    'https://raw.githubusercontent.com/webfansplz/proxy-list/main/https.txt',
    'https://raw.githubusercontent.com/webfansplz/proxy-list/main/socks4.txt',
    'https://raw.githubusercontent.com/webfansplz/proxy-list/main/socks5.txt',
    
    // ============================================
    // 22. PREMIUM PROXY LISTS (Free Tier)
    // ============================================
    'https://premiumproxy.net/api/proxy.php?port=http',
    'https://premiumproxy.net/api/proxy.php?port=https',
    'https://premiumproxy.net/api/proxy.php?port=socks4',
    'https://premiumproxy.net/api/proxy.php?port=socks5',
    
    // ============================================
    // 23. PROXY LIST FORMAT JSON
    // ============================================
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.json',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.json',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.json',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.json',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.json',
    'https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.json',
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
