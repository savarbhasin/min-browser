

const API_BASE_URL = 'http://localhost:8000/api' // Placeholder
// Cache key prefix
const CACHE_PREFIX = 'url_safety_cache_';



const urlSafety = {
    checkUrl: async function (url) {
        const cached = localStorage.getItem(CACHE_PREFIX + url);
        if (cached) {
            console.log('Returning cached result for:', url);
            return JSON.parse(cached);
        }
        try {
            const response = await fetch(`${API_BASE_URL}/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: url })
            })
            if (!response.ok) {
                throw new Error(`API call failed: ${response.status}`)
            }
            const data = await response.json()
            console.log('URL Safety Check Result:', url, data)
            try {
                localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(data));
            } catch (e) {
                console.warn('Failed to cache result:', e);
            }
            return data
        } catch (error) {
            console.error('Error checking URL safety:', error)
            return null // Fail open or closed? Let's fail open for now to avoid blocking on errors
        }
    },

    batchCheck: async function (urls) {
        const BATCH_SIZE = 100;
        const uniqueUrls = [...new Set(urls)]; // Remove duplicates
        const cachedResults = [];
        const urlsToFetch = [];

        // Check cache first
        uniqueUrls.forEach(url => {
            const cached = localStorage.getItem(CACHE_PREFIX + url);
            if (cached) {
                cachedResults.push(JSON.parse(cached));
            } else {
                urlsToFetch.push(url);
            }
        });

        if (urlsToFetch.length === 0) {
            console.log('All batch URLs found in cache.');
            return cachedResults;
        }

        const chunks = [];
        for (let i = 0; i < urlsToFetch.length; i += BATCH_SIZE) {
            chunks.push(urlsToFetch.slice(i, i + BATCH_SIZE));
        }

        try {
            const apiResults = await Promise.all(chunks.map(async (chunk) => {
                try {
                    const response = await fetch(`${API_BASE_URL}/check/batch`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ urls: chunk })
                    });
                    if (!response.ok) {
                        console.warn(`Batch API call failed for chunk: ${response.status}`);
                        return [];
                    }
                    const data = await response.json();

                    // Cache new results
                    data.forEach(result => {
                        if (result && result.url) {
                            try {
                                localStorage.setItem(CACHE_PREFIX + result.url, JSON.stringify(result));
                            } catch (e) {
                                console.warn('Failed to cache batch result:', e);
                            }
                        }
                    });

                    return data;
                } catch (e) {
                    console.error('Error in batch chunk:', e);
                    return [];
                }
            }));

            // Combine cached and fresh results
            return [...cachedResults, ...apiResults.flat()];
        } catch (error) {
            console.error('Error batch checking URLs:', error);
            return cachedResults; // Return whatever we have from cache
        }
    },

    blockPage: function (tabId, webviews, result) {
        console.log('Blocking page for tab:', tabId, 'Result:', result)
        const verdict = result.final_verdict || 'unsafe';

        let color, icon, titleText, bgColor;
        if (verdict === 'safe') {
            // Should not happen for blockPage usually, but handling just in case
            color = '#22c55e';
            bgColor = '#1a2e1a';
            titleText = 'Safe Website';
            icon = '🛡️';
        } else if (verdict === 'suspicious') {
            color = '#f59e0b';
            bgColor = '#2e2000';
            titleText = 'Suspicious Website';
            icon = '⚠️';
        } else {
            color = '#ef4444';
            bgColor = '#2e0000';
            titleText = 'Phishing Detected'; // or Unsafe Website
            icon = '🚨';
        }

        const score = result.risk_score !== undefined ? Math.round(result.risk_score) : 'N/A';
        const threats = (result.safe_browsing && result.safe_browsing.threats) ? result.safe_browsing.threats.map(t => t.threatType).join(', ') : '';
        const signals = result.suspicious_signals ? result.suspicious_signals.join(', ') : 'None';

        const script = `
      (function() {
        function showOverlay() {
            if (document.getElementById('safety-overlay')) return;
            const overlay = document.createElement('div');
            overlay.id = 'safety-overlay';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                backgroundColor: '${bgColor}', zIndex: '2147483647',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                color: '#fff'
            });

            overlay.innerHTML = \`
                <div style="font-size: 64px; margin-bottom: 20px;">${icon}</div>
                <h1 style="color: ${color}; font-size: 36px; margin: 0 0 10px 0;">${titleText}</h1>
                <p style="font-size: 18px; color: #ccc; margin-bottom: 30px;">Access to this page has been blocked for your safety.</p>
                
                <div style="background: rgba(0,0,0,0.3); padding: 20px; border-radius: 12px; width: 100%; max-width: 500px; margin-bottom: 30px; border: 1px solid ${color}40;">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">Detection Details</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 14px;">
                        <div>
                            <span style="color: #888;">Verdict:</span> <span style="color: ${color}; font-weight: bold;">${verdict.toUpperCase()}</span>
                        </div>
                        <div>
                            <span style="color: #888;">Risk Score:</span> <span style="font-weight: bold;">${score}/100</span>
                        </div>
                        ${threats ? `<div style="grid-column: span 2;"><span style="color: #888;">Threats:</span> <span style="color: #ef4444;">${threats}</span></div>` : ''}
                        <div style="grid-column: span 2;">
                            <span style="color: #888;">Signals:</span> <span style="color: #ccc;">${signals}</span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 20px;">
                    <button id="safety-back-btn" style="padding: 12px 24px; font-size: 16px; background: #22c55e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Go Back (Recommended)</button>
                    <button id="safety-proceed-btn" style="padding: 12px 24px; font-size: 16px; background: transparent; color: #888; border: 1px solid #888; border-radius: 6px; cursor: pointer;">Proceed Anyway</button>
                </div>
            \`;

            document.body.appendChild(overlay);
            window.stop();

            document.getElementById('safety-back-btn').onclick = () => {
                if (window.history.length > 1) window.history.back();
                else window.close();
            };
            document.getElementById('safety-proceed-btn').onclick = () => {
                overlay.remove();
            };
        }
        if (document.body) showOverlay();
        else document.addEventListener('DOMContentLoaded', showOverlay);
      })();
    `
        webviews.callAsync(tabId, 'executeJavaScript', [script, false, null])
    },

    showNotification: function (tabId, webviews, result) {
        const script = `
        (function() {
            if (document.getElementById('safety-notification')) return;
            
            const result = ${JSON.stringify(result)};
            const verdict = result.final_verdict || 'unknown';
            
            // Theme Logic
            const themes = {
                safe: { color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path></svg>' },
                suspicious: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' },
                unsafe: { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' }
            };
            const theme = themes[verdict] || themes.unsafe;
            
            // Risk Score Bar
            const score = Math.round(result.risk_score || 0);
            let barColor = '#22c55e';
            if (score > 30) barColor = '#f59e0b';
            if (score > 60) barColor = '#ef4444';

            // Signals
            const signals = (result.suspicious_signals || []).map(s => 
                \`<span style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 4px; margin-bottom: 4px; display: inline-block; text-transform: uppercase;">\${s.replace(/_/g, ' ')}</span>\`
            ).join('');

            // Enhanced Checks Construction
            let checksHtml = '';
            const ec = result.enhanced_checks || {};
            
            // Helper for check rows
            const checkRow = (label, value, isSuspicious, reason, isError = false) => {
                let valueColor = isSuspicious ? '#d97706' : '#166534';
                let icon = isSuspicious ? '⚠️' : '✓';
                if (isError) {
                    valueColor = '#6b7280';
                    icon = '❓';
                }
                return \`
                <div style="margin-bottom: 4px; font-size: 12px; display: flex; justify-content: space-between;">
                    <span style="color: #666;">\${label}:</span>
                    <span style="color: \${valueColor}; font-weight: 500;">\${value} \${icon}</span>
                </div>
                \${reason ? \`<div style="font-size: 11px; color: #d97706; margin-bottom: 4px; padding-left: 8px; border-left: 2px solid #d97706;">\${reason}</div>\` : ''}
            \`;
            };

            // ML Detection Row
            // Logic: If score > 0.9, do not show green tick (it's likely unsafe/suspicious)
            const mlScore = result.ml_score || 0;
            const mlLabel = result.ml_label || 'Unknown';
            const isMlSuspicious = mlScore > 0.9 || mlLabel === 'unsafe' || mlLabel === 'phishing';
            checksHtml += checkRow('ML Detection', \`\${mlScore.toFixed(3)} (\${mlLabel})\`, isMlSuspicious, null);

            // Domain Age
            if (ec.domain_age) {
                const age = ec.domain_age.age_days ? \`\${ec.domain_age.age_days} days\` : 'Unknown';
                const registrar = ec.domain_age.registrar ? \` • \${ec.domain_age.registrar}\` : '';
                const isError = !ec.domain_age.age_days;
                checksHtml += checkRow('Domain Age', age + registrar, ec.domain_age.suspicious, ec.domain_age.reason, isError);
            }

            // SSL Certificate
            if (ec.ssl_certificate) {
                const ssl = ec.ssl_certificate;
                let sslDetails = 'Invalid';
                if (ssl.valid) {
                    sslDetails = \`Valid\`;
                    if (ssl.issuer) sslDetails += \` (\${ssl.issuer})\`;
                    if (ssl.days_until_expiry !== undefined) sslDetails += \`, \${ssl.days_until_expiry} days left\`;
                }
                checksHtml += checkRow('SSL', sslDetails, ssl.suspicious, ssl.reason);
            }

            // DNS Records
            if (ec.dns_records) {
                const dns = ec.dns_records;
                const records = [];
                if (dns.has_mx_records) records.push('Has email');
                else records.push('No email');
                
                if (dns.has_a_records) records.push('Has A records');
                else records.push('No A records');
                
                const dnsStatus = records.join(' • ');
                checksHtml += checkRow('DNS Records', dnsStatus, dns.suspicious, dns.reason);
            }

            // Typosquatting
            if (ec.typosquatting && ec.typosquatting.is_typosquatting) {
                 let typoDetails = \`Similar to \${ec.typosquatting.target_brand}\`;
                 if (ec.typosquatting.similarity) typoDetails += \` (\${(ec.typosquatting.similarity * 100).toFixed(0)}%)\`;
                 if (ec.typosquatting.has_unicode_chars) typoDetails += ' • Unicode chars';
                 if (ec.typosquatting.has_brand_in_subdomain) typoDetails += ' • Brand in subdomain';
                 
                 checksHtml += checkRow('Typosquatting', typoDetails, true, null);
            } else if (ec.typosquatting && !ec.typosquatting.suspicious) {
                 // Optional: Show clean typosquatting check if desired, or skip to save space. 
                 // The React example shows "No typosquatting detected" in green.
                 // checksHtml += checkRow('Typosquatting', 'None detected', false, null);
            }

            // URL Features
            if (ec.enhanced_features) {
                const ef = ec.enhanced_features;
                if (ef.is_url_shortened) checksHtml += checkRow('URL Shortener', 'Detected', true, null);
                if (ef.has_ip_address) checksHtml += checkRow('Host Type', 'IP Address', true, null);
                if (ef.has_at_symbol) checksHtml += checkRow('Obfuscation', '@ Symbol Detected', true, null);
                if (ef.subdomain_count > 2) checksHtml += checkRow('Subdomains', \`\${ef.subdomain_count} detected\`, true, null);
                checksHtml += checkRow('Entropy', (ef.domain_entropy || 0).toFixed(2), false, null);
            }
            
            // Reputation Details
            // Google Safe Browsing
            if (result.safe_browsing) {
                const sb = result.safe_browsing;
                const isSbUnsafe = !sb.safe && sb.threats && sb.threats.length > 0;
                const sbValue = isSbUnsafe ? \`🚫 \${sb.threats.map(t => t.threatType).join(", ")}\` : 'Clean';
                checksHtml += checkRow('Google Safe Browsing', sbValue, isSbUnsafe, null);
            }

            if (ec.reputation) {
                const rep = ec.reputation;
                if (rep.phishtank) checksHtml += checkRow('PhishTank', rep.phishtank.in_database ? 'Listed' : 'Clean', rep.phishtank.in_database, null);
                if (rep.urlhaus) checksHtml += checkRow('URLhaus', rep.urlhaus.in_database ? 'Listed' : 'Clean', rep.urlhaus.in_database, null);
                if (rep.virustotal) {
                     const vtValue = rep.virustotal.detection_ratio || rep.virustotal; // Handle string or object if structure varies
                     const isVtSuspicious = typeof vtValue === 'string' && parseInt(vtValue.split('/')[0]) > 0;
                     checksHtml += checkRow('VirusTotal', vtValue, isVtSuspicious, null);
                }
            }
            
            // Reputation Alert (Top Level)
            let repHtml = '';
            if (ec.reputation && ec.reputation.flagged_by_services && ec.reputation.flagged_by_services.length > 0) {
                repHtml = \`<div style="background: #fee2e2; color: #991b1b; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: bold; margin-bottom: 8px;">
                    ⚠️ FLAGGED BY: \${ec.reputation.flagged_by_services.join(', ')}
                </div>\`;
            }

            const notif = document.createElement('div');
            notif.id = 'safety-notification';
            Object.assign(notif.style, {
                position: 'fixed', top: '20px', right: '20px', width: '340px',
                backgroundColor: '#ffffff', borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                zIndex: '2147483647', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                overflow: 'hidden', border: '1px solid ' + theme.border,
                animation: 'slideIn 0.4s ease-out',
                transition: 'opacity 0.3s ease'
            });

            notif.innerHTML = \`
                <div style="background: \${theme.bg}; padding: 12px 16px; border-bottom: 1px solid \${theme.border}; display: flex; align-items: center; gap: 10px;">
                    <div style="color: \${theme.color}; display: flex;">\${theme.icon}</div>
                    <div>
                        <h3 style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600;">\${verdict.charAt(0).toUpperCase() + verdict.slice(1)} Website</h3>
                    </div>
                </div>
                
                <div style="padding: 16px;">
                    \${repHtml}
                    
                    <div style="margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; color: #4b5563; margin-bottom: 6px;">
                            <span>Risk Score</span>
                            <span style="font-weight: 700; font-size: 18px; color: \${barColor}; line-height: 1;">\${score}/100</span>
                        </div>
                        <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                            <div style="width: \${score}%; height: 100%; background: \${barColor}; border-radius: 4px;"></div>
                        </div>
                    </div>

                    \${signals ? \`<div style="margin-bottom: 12px;">\${signals}</div>\` : ''}
                    
                    \${checksHtml ? \`<div style="border-top: 1px solid #f3f4f6; padding-top: 12px; margin-top: 12px;">\${checksHtml}</div>\` : ''}
                </div>
            \`;

            const style = document.createElement('style');
            style.innerHTML = \`
                @keyframes slideIn { from { transform: translateX(120%); } to { transform: translateX(0); } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
            \`;
            document.head.appendChild(style);
            document.body.appendChild(notif);

            let timeoutId;
            const closeNotification = () => {
                notif.style.opacity = '0';
                setTimeout(() => notif.remove(), 300);
            };

            const startTimer = () => {
                timeoutId = setTimeout(closeNotification, 5000);
            };

            notif.addEventListener('mouseenter', () => {
                clearTimeout(timeoutId);
            });

            notif.addEventListener('mouseleave', () => {
                startTimer();
            });

            // Initial timer
            startTimer();
        })();
        `
        webviews.callAsync(tabId, 'executeJavaScript', [script, false, null])
    },

    highlightRiskyUrls: function (tabId, results, webviews) {
        // results is expected to be the array from the batch check response
        // Filter for unsafe URLs
        const unsafeUrls = results.filter(r => r.final_verdict === 'unsafe' || r.final_verdict === 'suspicious');

        if (unsafeUrls.length === 0) return;

        const script = `
      (function() {
        const unsafeData = ${JSON.stringify(unsafeUrls)};
        const urlMap = {};
        unsafeData.forEach(item => {
            urlMap[item.url] = item;
        });

        const links = document.querySelectorAll('a');
        links.forEach(link => {
          if (urlMap[link.href]) {
            const data = urlMap[link.href];
            const isSuspicious = data.final_verdict === 'suspicious';
            const color = isSuspicious ? '#f59e0b' : '#ef4444';
            
            console.log('Highlighting unsafe link:', link.href);
            link.style.border = '2px solid ' + color;
            link.style.borderRadius = '4px';
            link.style.backgroundColor = isSuspicious ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)';
            link.style.transition = 'all 0.2s ease';
            
            // Custom tooltip logic
            link.addEventListener('mouseenter', (e) => {
                const tooltip = document.createElement('div');
                tooltip.id = 'safety-tooltip-' + Math.random().toString(36).substr(2, 9);
                Object.assign(tooltip.style, {
                    position: 'absolute', backgroundColor: '#1f2937', color: 'white',
                    padding: '10px', borderRadius: '8px', fontSize: '12px',
                    zIndex: '10000', pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    border: '1px solid ' + color, maxWidth: '280px', fontFamily: 'sans-serif'
                });
                
                const threats = (data.safe_browsing && data.safe_browsing.threats) ? 
                    data.safe_browsing.threats.map(t => t.threatType).join(', ') : '';
                
                tooltip.innerHTML = \`
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <strong style="color: \${color}; font-size: 13px;">\${isSuspicious ? 'Suspicious' : 'Unsafe'} Link</strong>
                    </div>
                    \${threats ? \`<div style="color: #fca5a5; margin-top: 4px;">🚨 \${threats}</div>\` : ''}
                \`;
                
                document.body.appendChild(tooltip);
                
                const rect = link.getBoundingClientRect();
                tooltip.style.top = (rect.bottom + window.scrollY + 5) + 'px';
                tooltip.style.left = (rect.left + window.scrollX) + 'px';
                
                link.dataset.tooltipId = tooltip.id;
            });
            
            link.addEventListener('mouseleave', (e) => {
                const id = link.dataset.tooltipId;
                if (id) {
                    const el = document.getElementById(id);
                    if (el) el.remove();
                }
            });
          }
        });
      })();
    `
        webviews.callAsync(tabId, 'executeJavaScript', [script, false, null])
    },

    scrapeUrls: function (tabId, webviews, callback) {
        const script = `
      (function() {
        const urls = Array.from(document.querySelectorAll('a')).map(a => a.href);
        console.log('Scraped URLs:', urls.length);
        return urls;
      })();
    `
        webviews.callAsync(tabId, 'executeJavaScript', [script, false, null], (err, result) => {
            if (err) {
                console.error('Error scraping URLs:', err);
            }
            if (!err && result) {
                console.log('Scraped URLs result:', result.length);
                callback(result);
            }
        })
    }
}

module.exports = urlSafety
