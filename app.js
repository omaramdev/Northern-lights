// ============================================================
// Northern Lights Finder - Iceland
// A mobile-first app to find the best aurora viewing spots
// based on your location, aurora activity, cloud cover, and
// remaining darkness.
// ============================================================

(function () {
    'use strict';

    // ---- Curated viewing spots across Iceland ----
    // Each spot is a known dark-sky location away from light pollution
    const VIEWING_SPOTS = [
        {
            name: 'Thingvellir National Park',
            lat: 64.2558,
            lng: -21.1290,
            desc: 'UNESCO site with wide open skies and minimal light pollution'
        },
        {
            name: 'Grotta Lighthouse',
            lat: 64.1637,
            lng: -22.0186,
            desc: 'Close to Reykjavik with clear northern horizon'
        },
        {
            name: 'Vik Beach',
            lat: 63.4186,
            lng: -19.0060,
            desc: 'Black sand beach with unobstructed views in all directions'
        },
        {
            name: 'Jokulsarlon Glacier Lagoon',
            lat: 64.0784,
            lng: -16.2306,
            desc: 'Aurora reflecting off icebergs — iconic viewing'
        },
        {
            name: 'Kirkjufell, Snaefellsnes',
            lat: 64.9426,
            lng: -23.3071,
            desc: 'Famous mountain with dark skies on the peninsula'
        },
        {
            name: 'Seljalandsfoss',
            lat: 63.6156,
            lng: -19.9886,
            desc: 'Waterfall with aurora backdrop, open farmland views'
        },
        {
            name: 'Skogafoss',
            lat: 63.5321,
            lng: -19.5113,
            desc: 'Powerful waterfall with wide southern sky'
        },
        {
            name: 'Lake Myvatn',
            lat: 65.6030,
            lng: -16.9964,
            desc: 'Remote northern Iceland with exceptional dark skies'
        },
        {
            name: 'Stokksnes / Vestrahorn',
            lat: 64.2538,
            lng: -14.9685,
            desc: 'Dramatic mountain backdrop, very dark skies'
        },
        {
            name: 'Reykjanes Lighthouse',
            lat: 63.8119,
            lng: -22.7064,
            desc: 'Southwest tip of Iceland, wide open ocean horizon'
        },
        {
            name: 'Gullfoss',
            lat: 64.3271,
            lng: -20.1199,
            desc: 'Golden Circle waterfall with dark surroundings at night'
        },
        {
            name: 'Godafoss',
            lat: 65.6826,
            lng: -17.5502,
            desc: 'Waterfall of the Gods in northern Iceland, low light pollution'
        },
        {
            name: 'Dyrholaey',
            lat: 63.4006,
            lng: -19.1292,
            desc: 'Elevated peninsula with 360-degree views, very dark'
        },
        {
            name: 'Kleifarvatn Lake',
            lat: 63.8841,
            lng: -21.9936,
            desc: 'Quiet lake on Reykjanes, short drive from Reykjavik'
        },
        {
            name: 'Hvitserkur',
            lat: 65.6060,
            lng: -20.6318,
            desc: 'Remote rock formation in northwest with pristine darkness'
        },
        {
            name: 'Akureyri Outskirts',
            lat: 65.7100,
            lng: -18.1300,
            desc: 'Capital of the north — drive just outside for dark skies'
        },
        {
            name: 'Geysir Area',
            lat: 64.3104,
            lng: -20.3024,
            desc: 'Golden Circle geothermal area, dark fields at night'
        },
        {
            name: 'Arnarstapi, Snaefellsnes',
            lat: 64.7667,
            lng: -23.6250,
            desc: 'Coastal village on the peninsula, very low light pollution'
        }
    ];

    // ---- Kp index interpretation for Iceland's latitude (63-66 N) ----
    // At these latitudes, aurora is visible at lower Kp values
    const KP_INFO = [
        { min: 0, max: 1, label: 'Quiet', color: '#ff4466', eyeVisible: false },
        { min: 1, max: 2, label: 'Low', color: '#ff6644', eyeVisible: false },
        { min: 2, max: 3, label: 'Moderate', color: '#ffaa00', eyeVisible: true },
        { min: 3, max: 4, label: 'Active', color: '#aadd00', eyeVisible: true },
        { min: 4, max: 5, label: 'Strong', color: '#00e87b', eyeVisible: true },
        { min: 5, max: 6, label: 'Strong+', color: '#00e87b', eyeVisible: true },
        { min: 6, max: 7, label: 'Very Strong', color: '#00ccff', eyeVisible: true },
        { min: 7, max: 9, label: 'Intense', color: '#aa66ff', eyeVisible: true }
    ];

    // Iceland average driving speed accounting for winding roads and conditions
    const AVG_SPEED_KMH = 65;
    const ROAD_WINDING_FACTOR = 1.35; // road distance vs straight-line

    // ---- State ----
    let appState = {
        userLat: null,
        userLng: null,
        kpCurrent: null,
        kpForecast: [],
        lastUpdated: null,
        loading: true,
        locationError: null,
        locationMode: 'gps', // 'gps' or 'address'
        addressName: null     // display name when using address mode
    };

    // ============================================================
    // GEOLOCATION
    // ============================================================

    function getUserLocation() {
        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                function (err) {
                    reject(err);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
            );
        });
    }

    // ============================================================
    // API CALLS
    // ============================================================

    async function fetchAuroraData() {
        // Fetch current Kp and 3-day forecast from NOAA
        var results = { current: null, forecast: [] };

        try {
            var [currentRes, forecastRes] = await Promise.all([
                fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'),
                fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json')
            ]);

            if (currentRes.ok) {
                var currentData = await currentRes.json();
                // Format: array of arrays, first row is header
                // ["time_tag","Kp","a_running","station_count"]
                if (currentData.length > 1) {
                    var latest = currentData[currentData.length - 1];
                    results.current = parseFloat(latest[1]);
                }
            }

            if (forecastRes.ok) {
                var forecastData = await forecastRes.json();
                // Format: [["time_tag","Kp","observed","noaa_scale"], ...]
                if (forecastData.length > 1) {
                    results.forecast = forecastData.slice(1).map(function (row) {
                        return {
                            time: new Date(row[0] + ' UTC'),
                            kp: parseFloat(row[1]),
                            observed: row[2] === 'observed'
                        };
                    });
                }
            }
        } catch (e) {
            console.warn('Aurora API error:', e);
        }

        return results;
    }

    async function fetchCloudCover(lat, lng) {
        // Open-Meteo: free, no API key, CORS-enabled
        try {
            var url = 'https://api.open-meteo.com/v1/forecast'
                + '?latitude=' + lat.toFixed(4)
                + '&longitude=' + lng.toFixed(4)
                + '&hourly=cloud_cover'
                + '&forecast_days=2'
                + '&timezone=Atlantic/Reykjavik';

            var res = await fetch(url);
            if (!res.ok) return null;
            var data = await res.json();

            if (data.hourly && data.hourly.time && data.hourly.cloud_cover) {
                return data.hourly.time.map(function (t, i) {
                    return {
                        time: new Date(t),
                        cloudCover: data.hourly.cloud_cover[i]
                    };
                });
            }
        } catch (e) {
            console.warn('Cloud cover API error for', lat, lng, e);
        }
        return null;
    }

    async function fetchCloudCoverForSpots(spots) {
        // Fetch cloud cover in parallel for all spots
        var promises = spots.map(function (spot) {
            return fetchCloudCover(spot.lat, spot.lng).then(function (data) {
                return { spot: spot, cloudData: data };
            });
        });
        return Promise.all(promises);
    }

    // ============================================================
    // GEOCODING (Open-Meteo — free, no API key)
    // ============================================================

    async function geocodeAddress(query) {
        try {
            var url = 'https://geocoding-api.open-meteo.com/v1/search'
                + '?name=' + encodeURIComponent(query)
                + '&count=5'
                + '&language=en'
                + '&format=json';

            var res = await fetch(url);
            if (!res.ok) return null;
            var data = await res.json();

            if (data.results && data.results.length > 0) {
                // Prefer results in Iceland, otherwise take the first
                var icelandResult = data.results.find(function (r) {
                    return r.country_code === 'IS';
                });
                var result = icelandResult || data.results[0];
                return {
                    lat: result.latitude,
                    lng: result.longitude,
                    name: result.name + (result.admin1 ? ', ' + result.admin1 : '')
                        + (result.country ? ', ' + result.country : '')
                };
            }
        } catch (e) {
            console.warn('Geocoding error:', e);
        }
        return null;
    }

    // ============================================================
    // SUN CALCULATIONS (simplified NOAA algorithm)
    // ============================================================

    function toJulianDate(date) {
        return date.getTime() / 86400000 + 2440587.5;
    }

    function toRad(deg) { return deg * Math.PI / 180; }
    function toDeg(rad) { return rad * 180 / Math.PI; }

    function calcSunTimes(lat, lng, date) {
        // Calculate sunrise, sunset, and astronomical twilight times
        var jd = toJulianDate(date);
        var n = Math.floor(jd - 2451545.0 + 0.0008);
        var jStar = n - lng / 360;
        var M = (357.5291 + 0.98560028 * jStar) % 360;
        var mRad = toRad(M);
        var C = 1.9148 * Math.sin(mRad) + 0.0200 * Math.sin(2 * mRad) + 0.0003 * Math.sin(3 * mRad);
        var lambdaSun = (M + C + 180 + 102.9372) % 360;
        var lambdaRad = toRad(lambdaSun);
        var sinDec = Math.sin(lambdaRad) * Math.sin(toRad(23.4393));
        var declination = Math.asin(sinDec);
        var cosDec = Math.cos(declination);

        var jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(mRad) - 0.0069 * Math.sin(2 * lambdaRad);

        function getHourAngle(elevationDeg) {
            var cosH = (Math.sin(toRad(elevationDeg)) - Math.sin(toRad(lat)) * sinDec)
                / (Math.cos(toRad(lat)) * cosDec);
            if (cosH > 1) return null;  // never rises above this elevation
            if (cosH < -1) return null; // never sets below this elevation (midnight sun)
            return toDeg(Math.acos(cosH));
        }

        // Standard sunrise/sunset: solar elevation = -0.833 degrees
        var haStandard = getHourAngle(-0.833);
        // Astronomical twilight: solar elevation = -12 degrees
        // Below this, sky is fully dark — best for aurora
        var haTwilight = getHourAngle(-12);

        var result = {
            solarNoon: jdToDate(jTransit),
            sunrise: null,
            sunset: null,
            astroTwilightEnd: null,  // morning — sky starts getting bright
            astroTwilightStart: null, // evening — sky becomes fully dark
            polarNight: false,
            midnightSun: false
        };

        if (haStandard !== null) {
            var jRise = jTransit - haStandard / 360;
            var jSet = jTransit + haStandard / 360;
            result.sunrise = jdToDate(jRise);
            result.sunset = jdToDate(jSet);
        } else {
            // Check if it's polar night or midnight sun
            var noonElevation = toDeg(Math.asin(
                Math.sin(toRad(lat)) * sinDec + Math.cos(toRad(lat)) * cosDec
            ));
            if (noonElevation < -0.833) {
                result.polarNight = true;
            } else {
                result.midnightSun = true;
            }
        }

        if (haTwilight !== null) {
            var jTwEnd = jTransit - haTwilight / 360;
            var jTwStart = jTransit + haTwilight / 360;
            result.astroTwilightEnd = jdToDate(jTwEnd);
            result.astroTwilightStart = jdToDate(jTwStart);
        }

        return result;
    }

    function jdToDate(jd) {
        return new Date((jd - 2440587.5) * 86400000);
    }

    function isDarkForAurora(sunTimes, checkTime) {
        // Returns true if it's dark enough to see aurora at checkTime
        if (sunTimes.polarNight) return true;
        if (sunTimes.midnightSun) return false;

        // Use astronomical twilight if available, otherwise sunset/sunrise
        var darkStart = sunTimes.astroTwilightStart || sunTimes.sunset;
        var darkEnd = sunTimes.astroTwilightEnd || sunTimes.sunrise;

        if (!darkStart || !darkEnd) return true; // assume dark if can't calculate

        var t = checkTime.getTime();

        // Handle overnight: dark period crosses midnight
        if (darkStart > darkEnd) {
            // Dark from darkStart (evening) to darkEnd (next morning)
            return t >= darkStart.getTime() || t <= darkEnd.getTime();
        }
        return t >= darkStart.getTime() && t <= darkEnd.getTime();
    }

    function getHoursOfDarknessRemaining(sunTimes, fromTime) {
        if (sunTimes.polarNight) return 24;
        if (sunTimes.midnightSun) return 0;

        var darkEnd = sunTimes.astroTwilightEnd || sunTimes.sunrise;
        if (!darkEnd) return 12; // fallback

        var endTime = darkEnd.getTime();
        var nowTime = fromTime.getTime();

        // If darkEnd is earlier in the day than now, it means the end is tomorrow morning
        if (endTime < nowTime) {
            endTime += 24 * 60 * 60 * 1000;
        }

        return Math.max(0, (endTime - nowTime) / (1000 * 60 * 60));
    }

    // ============================================================
    // DISTANCE & DRIVE TIME
    // ============================================================

    function haversineDistance(lat1, lng1, lat2, lng2) {
        var R = 6371; // Earth radius in km
        var dLat = toRad(lat2 - lat1);
        var dLng = toRad(lng2 - lng1);
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
              * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function estimateDriveMinutes(straightLineKm) {
        var roadKm = straightLineKm * ROAD_WINDING_FACTOR;
        return Math.round((roadKm / AVG_SPEED_KMH) * 60);
    }

    // ============================================================
    // VISIBILITY SCORING
    // ============================================================

    function getKpAtTime(forecast, targetTime) {
        // Find the forecast Kp closest to targetTime
        if (!forecast || forecast.length === 0) return appState.kpCurrent || 0;

        var target = targetTime.getTime();
        var closest = forecast[0];
        var closestDiff = Math.abs(forecast[0].time.getTime() - target);

        for (var i = 1; i < forecast.length; i++) {
            var diff = Math.abs(forecast[i].time.getTime() - target);
            if (diff < closestDiff) {
                closest = forecast[i];
                closestDiff = diff;
            }
        }
        return closest.kp;
    }

    function getCloudCoverAtTime(cloudData, targetTime) {
        if (!cloudData || cloudData.length === 0) return null;

        var target = targetTime.getTime();
        var closest = cloudData[0];
        var closestDiff = Math.abs(cloudData[0].time.getTime() - target);

        for (var i = 1; i < cloudData.length; i++) {
            var diff = Math.abs(cloudData[i].time.getTime() - target);
            if (diff < closestDiff) {
                closest = cloudData[i];
                closestDiff = diff;
            }
        }
        return closest.cloudCover;
    }

    function getKpInfo(kp) {
        for (var i = KP_INFO.length - 1; i >= 0; i--) {
            if (kp >= KP_INFO[i].min) return KP_INFO[i];
        }
        return KP_INFO[0];
    }

    function calculateSpotScore(spot, cloudAtArrival, kpAtArrival, isDark, hoursRemaining, driveMinutes) {
        // Score from 0-100 based on multiple factors
        // Cloud cover and darkness are hard gates — if you can't see the sky,
        // nothing else matters.

        // Hard gate: not dark = can't see aurora
        if (!isDark) return 5;

        // Hard gate: overcast sky = can't see through clouds
        if (cloudAtArrival !== null && cloudAtArrival >= 90) return 8;
        if (cloudAtArrival !== null && cloudAtArrival >= 75) return Math.min(20, kpAtArrival * 3);

        var score = 0;

        // Kp factor (0-35 points)
        // At Iceland's latitude, Kp 2+ is visible to naked eye
        if (kpAtArrival >= 5) score += 35;
        else if (kpAtArrival >= 4) score += 30;
        else if (kpAtArrival >= 3) score += 25;
        else if (kpAtArrival >= 2) score += 18;
        else if (kpAtArrival >= 1) score += 8;

        // Cloud cover factor (0-35 points)
        // Heavily weighted — clouds block everything
        if (cloudAtArrival !== null) {
            var clearness = 100 - cloudAtArrival;
            score += Math.round((clearness / 100) * 35);
        } else {
            score += 17; // unknown, give benefit of doubt
        }

        // Darkness factor (0-20 points)
        if (hoursRemaining >= 4) {
            score += 20;
        } else if (hoursRemaining >= 2) {
            score += 15;
        } else if (hoursRemaining >= 1) {
            score += 8;
        } else {
            score += 3;
        }

        // Drive time penalty (0-10 points, shorter = better)
        if (driveMinutes <= 15) score += 10;
        else if (driveMinutes <= 30) score += 8;
        else if (driveMinutes <= 60) score += 5;
        else if (driveMinutes <= 90) score += 3;

        return Math.min(100, Math.max(0, score));
    }

    // ============================================================
    // 48-HOUR FORECAST — find best future viewing windows
    // ============================================================

    function findBestWindows(spots, cloudMap, forecast, userLat, userLng) {
        // Scan every hour for the next 48 hours across all spots
        // and return the top windows sorted by score
        var now = new Date();
        var windows = [];
        var hoursToScan = 48;

        for (var h = 0; h < hoursToScan; h++) {
            var checkTime = new Date(now.getTime() + h * 3600000);
            var kpAtTime = getKpAtTime(forecast, checkTime);

            for (var s = 0; s < spots.length; s++) {
                var spot = spots[s];
                var cloudData = cloudMap[spot.name] || null;
                var cloudAtTime = cloudData ? getCloudCoverAtTime(cloudData, checkTime) : null;

                var spotSunTimes = calcSunTimes(spot.lat, spot.lng, checkTime);
                var isDark = isDarkForAurora(spotSunTimes, checkTime);
                var hoursRemaining = getHoursOfDarknessRemaining(spotSunTimes, checkTime);

                // Skip daytime — no point scoring when it's bright
                if (!isDark) continue;

                var score = calculateSpotScore(spot, cloudAtTime, kpAtTime, isDark, hoursRemaining, spot.driveMinutes);

                // Only include windows that are at least "Fair"
                if (score < 35) continue;

                windows.push({
                    spot: spot,
                    time: checkTime,
                    score: score,
                    kp: kpAtTime,
                    cloud: cloudAtTime,
                    hoursRemaining: hoursRemaining,
                    hoursFromNow: h
                });
            }
        }

        // Sort by score descending
        windows.sort(function (a, b) { return b.score - a.score; });

        // Deduplicate: keep best window per spot (they tend to cluster)
        var seen = {};
        var best = [];
        for (var i = 0; i < windows.length; i++) {
            var w = windows[i];
            if (!seen[w.spot.name]) {
                seen[w.spot.name] = true;
                best.push(w);
            }
            if (best.length >= 5) break;
        }

        return best;
    }

    // ============================================================
    // UI RENDERING
    // ============================================================

    function renderAuroraStatus(kpCurrent, forecast) {
        var container = document.getElementById('aurora-status');

        if (kpCurrent === null) {
            container.innerHTML = '<div class="aurora-status">'
                + '<p style="color:var(--text-secondary); text-align:center;">Aurora data unavailable — check back shortly</p>'
                + '</div>';
            return;
        }

        var info = getKpInfo(kpCurrent);
        var dotColor = info.color;

        // Build forecast mini-bars (next 12 hours in 3-hour blocks)
        var now = new Date();
        var forecastBarsHtml = '';
        var forecastTimesHtml = '';
        var forecastItems = getUpcomingForecast(forecast, now, 8);

        for (var i = 0; i < forecastItems.length; i++) {
            var fi = forecastItems[i];
            var barInfo = getKpInfo(fi.kp);
            var heightPct = Math.max(10, (fi.kp / 9) * 100);
            var hours = fi.time.getHours();
            var label = (hours < 10 ? '0' : '') + hours + ':00';
            forecastBarsHtml += '<div class="kp-forecast-bar" style="height:' + heightPct + '%;background:' + barInfo.color + '">'
                + '<span class="time-label">' + label + '</span>'
                + '</div>';
        }

        var visibleText = info.eyeVisible
            ? '<span style="color:' + info.color + '">Visible to naked eye at this latitude</span>'
            : '<span style="color:var(--text-secondary)">Likely too faint for naked eye</span>';

        container.innerHTML = '<div class="aurora-status">'
            + '<div class="aurora-status-row">'
            + '  <div>'
            + '    <div class="aurora-kp" style="color:' + info.color + '">Kp ' + kpCurrent.toFixed(1) + '</div>'
            + '    <div class="aurora-label">Current geomagnetic activity</div>'
            + '  </div>'
            + '  <div class="aurora-activity">'
            + '    <div class="aurora-activity-level"><span class="aurora-dot" style="background:' + dotColor + '"></span>' + info.label + '</div>'
            + '    <div class="aurora-activity-desc">' + visibleText + '</div>'
            + '  </div>'
            + '</div>'
            + '<div class="kp-forecast-row">'
            + '  <div class="kp-forecast-label">Kp forecast (upcoming hours)</div>'
            + '  <div class="kp-forecast-bars">' + forecastBarsHtml + '</div>'
            + '</div>'
            + '</div>';
    }

    function getUpcomingForecast(forecast, now, count) {
        if (!forecast || forecast.length === 0) return [];
        var nowTime = now.getTime();
        var upcoming = forecast.filter(function (f) {
            return f.time.getTime() >= nowTime - 3 * 3600000; // include recent
        });
        return upcoming.slice(0, count);
    }

    function renderDarknessInfo(sunTimes, now) {
        var container = document.getElementById('darkness-info');

        if (sunTimes.midnightSun) {
            container.innerHTML = '<div class="darkness-info error-text">'
                + 'It\'s midnight sun season — the sky won\'t get dark enough for aurora viewing.'
                + '</div>';
            return;
        }

        if (sunTimes.polarNight) {
            container.innerHTML = '<div class="darkness-info">'
                + 'Polar night — dark all day. Perfect conditions for aurora viewing.'
                + '</div>';
            return;
        }

        var dark = isDarkForAurora(sunTimes, now);
        var hoursLeft = getHoursOfDarknessRemaining(sunTimes, now);

        if (dark) {
            var endTime = sunTimes.astroTwilightEnd || sunTimes.sunrise;
            var endStr = formatTime(endTime);
            container.innerHTML = '<div class="darkness-info">'
                + 'Sky is <strong style="color:var(--accent)">dark enough</strong> for aurora viewing. '
                + 'Darkness until <strong>' + endStr + '</strong> (~' + hoursLeft.toFixed(1) + ' hrs remaining)'
                + '</div>';
        } else {
            var startTime = sunTimes.astroTwilightStart || sunTimes.sunset;
            if (startTime && startTime.getTime() > now.getTime()) {
                var startStr = formatTime(startTime);
                container.innerHTML = '<div class="darkness-info">'
                    + 'Sky is <strong style="color:var(--warning)">not yet dark enough</strong>. '
                    + 'Darkness begins at <strong>' + startStr + '</strong>'
                    + '</div>';
            } else {
                container.innerHTML = '<div class="darkness-info error-text">'
                    + 'Sky is not dark enough for aurora viewing right now.'
                    + '</div>';
            }
        }
    }

    function renderForecastWindows(windows) {
        var container = document.getElementById('forecast-windows');

        if (!windows || windows.length === 0) {
            container.innerHTML = '<div class="forecast-section">'
                + '<div class="section-label">Best viewing in next 48 hours</div>'
                + '<div class="forecast-empty">No good viewing windows found in the next 48 hours. '
                + 'Conditions may improve — check back later.</div>'
                + '</div>';
            return;
        }

        var html = '<div class="forecast-section">'
            + '<div class="section-label">Best viewing in next 48 hours</div>'
            + '<div class="forecast-list">';

        for (var i = 0; i < windows.length; i++) {
            var w = windows[i];
            var badgeClass, badgeText;
            if (w.score >= 70) { badgeClass = 'badge-great'; badgeText = 'Great'; }
            else if (w.score >= 55) { badgeClass = 'badge-good'; badgeText = 'Good'; }
            else { badgeClass = 'badge-fair'; badgeText = 'Fair'; }

            var kpInfo = getKpInfo(w.kp);
            var clearPct = w.cloud !== null ? (100 - w.cloud) : null;
            var clearLabel = clearPct !== null ? (clearPct + '% clear') : 'Cloud data N/A';
            var clearColor = clearPct !== null
                ? (clearPct >= 70 ? 'var(--accent)' : clearPct >= 40 ? 'var(--warning)' : 'var(--danger)')
                : 'var(--text-secondary)';

            // Format when
            var whenStr = formatForecastTime(w.time, w.hoursFromNow);

            html += '<div class="forecast-card' + (i === 0 ? ' top-pick' : '') + '">'
                + '<div class="forecast-card-header">'
                + '  <div class="forecast-when">' + whenStr + '</div>'
                + '  <span class="spot-badge ' + badgeClass + '">' + badgeText + '</span>'
                + '</div>'
                + '<div class="forecast-spot-name">' + w.spot.name + '</div>'
                + '<div class="forecast-details">'
                + '  <span style="color:' + kpInfo.color + '">Kp ' + w.kp.toFixed(1) + '</span>'
                + '  <span class="forecast-sep">&middot;</span>'
                + '  <span style="color:' + clearColor + '">' + clearLabel + '</span>'
                + '  <span class="forecast-sep">&middot;</span>'
                + '  <span>' + w.spot.driveMinutes + ' min drive</span>'
                + '</div>'
                + '</div>';
        }

        html += '</div></div>';
        container.innerHTML = html;
    }

    function formatForecastTime(date, hoursFromNow) {
        var now = new Date();
        var tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        var dayLabel;
        if (date.getDate() === now.getDate() && date.getMonth() === now.getMonth()) {
            dayLabel = 'Tonight';
        } else if (date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth()) {
            dayLabel = 'Tomorrow';
        } else {
            var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            dayLabel = days[date.getDay()];
        }

        var timeStr = formatTime(date);
        var inHours = hoursFromNow < 1
            ? 'now'
            : (hoursFromNow < 24 ? 'in ' + hoursFromNow + 'h' : 'in ' + Math.round(hoursFromNow) + 'h');

        return dayLabel + ' at ' + timeStr + ' <span class="forecast-in">(' + inHours + ')</span>';
    }

    function renderSpotCards(spots) {
        var container = document.getElementById('spots-container');
        var maxDrive = parseInt(document.getElementById('max-drive-time').value, 10);

        var filtered = spots.filter(function (s) { return s.driveMinutes <= maxDrive; });

        // Sort based on user selection
        var sortBy = document.getElementById('sort-by').value;
        switch (sortBy) {
            case 'kp':
                filtered.sort(function (a, b) { return b.kpAtArrival - a.kpAtArrival || b.score - a.score; });
                break;
            case 'clouds':
                filtered.sort(function (a, b) {
                    var aCloud = a.cloudAtArrival !== null ? a.cloudAtArrival : 100;
                    var bCloud = b.cloudAtArrival !== null ? b.cloudAtArrival : 100;
                    return aCloud - bCloud || b.score - a.score;
                });
                break;
            case 'distance':
                filtered.sort(function (a, b) { return a.driveMinutes - b.driveMinutes || b.score - a.score; });
                break;
            default:
                filtered.sort(function (a, b) { return b.score - a.score; });
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="no-spots-message">'
                + 'No viewing spots within your max drive time. Try increasing the distance.'
                + '</div>';
            return;
        }

        var nearLabel = appState.addressName ? 'Best spots near ' + appState.addressName.split(',')[0] : 'Best spots near you';
        var html = '<div class="section-label">' + nearLabel + ' (' + filtered.length + ' found)</div>'
            + '<div class="spots-list">';

        for (var i = 0; i < filtered.length; i++) {
            html += renderOneSpot(filtered[i], i === 0);
        }

        html += '</div>';
        container.innerHTML = html;

        // Attach navigation click handlers
        var navBtns = container.querySelectorAll('.navigate-btn');
        navBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var lat = parseFloat(btn.dataset.lat);
                var lng = parseFloat(btn.dataset.lng);
                var name = btn.dataset.name;
                openNavigation(lat, lng, name);
            });
        });
    }

    function renderOneSpot(spot, isTopPick) {
        var badgeClass, badgeText;
        if (spot.score >= 70) { badgeClass = 'badge-great'; badgeText = 'Great'; }
        else if (spot.score >= 55) { badgeClass = 'badge-good'; badgeText = 'Good'; }
        else if (spot.score >= 35) { badgeClass = 'badge-fair'; badgeText = 'Fair'; }
        else { badgeClass = 'badge-poor'; badgeText = 'Poor'; }

        // Kp bar
        var kpPct = Math.min(100, (spot.kpAtArrival / 9) * 100);
        var kpInfo = getKpInfo(spot.kpAtArrival);

        // Cloud bar (inverted: lower cloud = better = more green)
        var cloudKnown = spot.cloudAtArrival !== null;
        var clearPct, cloudColor, cloudLabel;
        if (cloudKnown) {
            clearPct = 100 - spot.cloudAtArrival;
            cloudColor = clearPct >= 70 ? 'var(--bar-fill-good)' : clearPct >= 40 ? 'var(--bar-fill-ok)' : 'var(--bar-fill-bad)';
            cloudLabel = clearPct + '%';
        } else {
            clearPct = 0;
            cloudColor = 'var(--text-secondary)';
            cloudLabel = 'No data';
        }

        // Darkness bar
        var darkPct = Math.min(100, (spot.hoursRemaining / 8) * 100);
        var darkColor = spot.hoursRemaining >= 3 ? 'var(--bar-fill-good)' : spot.hoursRemaining >= 1 ? 'var(--bar-fill-ok)' : 'var(--bar-fill-bad)';

        // Verdict — cloud cover is the #1 gatekeeper
        var verdictClass, verdictText;
        var overcast = spot.cloudAtArrival !== null && spot.cloudAtArrival >= 90;
        var heavyClouds = spot.cloudAtArrival !== null && spot.cloudAtArrival >= 70;

        if (!spot.isDarkAtArrival) {
            verdictClass = 'verdict-negative';
            verdictText = 'Sky won\'t be dark enough when you arrive';
        } else if (overcast) {
            verdictClass = 'verdict-negative';
            verdictText = 'Overcast — clouds will block the view (' + spot.cloudAtArrival + '% cloud cover)';
        } else if (heavyClouds) {
            verdictClass = 'verdict-negative';
            verdictText = 'Heavy cloud cover (' + spot.cloudAtArrival + '%) — very unlikely to see aurora';
        } else if (spot.cloudAtArrival !== null && spot.cloudAtArrival >= 50) {
            verdictClass = 'verdict-caution';
            verdictText = 'Partly cloudy (' + spot.cloudAtArrival + '%) — may get glimpses between gaps';
        } else if (spot.score >= 55) {
            verdictClass = 'verdict-positive';
            verdictText = 'Aurora likely visible when you arrive — '
                + spot.hoursRemaining.toFixed(1) + ' hrs of darkness remaining';
        } else if (spot.score >= 35) {
            verdictClass = 'verdict-caution';
            var reasons = [];
            if (spot.kpAtArrival < 2) reasons.push('low aurora activity');
            if (spot.hoursRemaining < 2) reasons.push('limited darkness remaining');
            verdictText = 'Possible viewing' + (reasons.length > 0 ? ' — ' + reasons.join(', ') : '');
        } else {
            verdictClass = 'verdict-negative';
            var badReasons = [];
            if (spot.kpAtArrival < 2) badReasons.push('weak aurora activity');
            if (spot.hoursRemaining < 1) badReasons.push('almost sunrise');
            verdictText = 'Low chance' + (badReasons.length > 0 ? ' — ' + badReasons.join(', ') : '');
        }

        var arrivalStr = formatTime(spot.arrivalTime);

        return '<div class="spot-card' + (isTopPick ? ' top-pick' : '') + '">'
            + '<div class="spot-card-header">'
            + '  <div>'
            + '    <div class="spot-name">' + spot.name + '</div>'
            + '    <div class="spot-distance">'
            + spot.distanceKm.toFixed(0) + ' km away &middot; ~' + spot.driveMinutes + ' min drive'
            + ' &middot; Arrive ' + arrivalStr
            + '    </div>'
            + '  </div>'
            + '  <span class="spot-badge ' + badgeClass + '">' + badgeText + '</span>'
            + '</div>'
            + '<div class="spot-factors">'
            + renderFactor('Aurora', kpPct, kpInfo.color, 'Kp ' + spot.kpAtArrival.toFixed(1))
            + renderFactor('Clear sky', clearPct, cloudColor, cloudLabel === 'N/A' ? cloudLabel : (clearPct + '%'))
            + renderFactor('Darkness', darkPct, darkColor, spot.hoursRemaining.toFixed(1) + ' hrs')
            + '</div>'
            + '<div class="spot-verdict ' + verdictClass + '">' + verdictText + '</div>'
            + '<button class="navigate-btn" data-lat="' + spot.lat + '" data-lng="' + spot.lng + '" data-name="' + spot.name + '">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'
            + '<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>'
            + 'Navigate to ' + spot.name
            + '</button>'
            + '</div>';
    }

    function renderFactor(label, pct, color, value) {
        return '<div class="factor-row">'
            + '<span class="factor-label">' + label + '</span>'
            + '<div class="factor-bar-container">'
            + '  <div class="factor-bar" style="width:' + pct + '%;background:' + color + '"></div>'
            + '</div>'
            + '<span class="factor-value" style="color:' + color + '">' + value + '</span>'
            + '</div>';
    }

    function openNavigation(lat, lng, name) {
        // Detect iOS for Apple Maps, otherwise Google Maps
        var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (isIOS) {
            window.location.href = 'maps://maps.apple.com/?daddr=' + lat + ',' + lng + '&dirflg=d';
        } else {
            window.open('https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng, '_blank');
        }
    }

    function formatTime(date) {
        if (!date) return '--:--';
        var h = date.getHours();
        var m = date.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function showLoading(message) {
        document.getElementById('spots-container').innerHTML =
            '<div class="loading"><div class="loading-spinner"></div><p>' + message + '</p></div>';
    }

    function showError(message, showRetry) {
        var html = '<div class="message-box"><p>' + message + '</p>';
        if (showRetry) {
            html += '<button class="action-btn" onclick="location.reload()">Try again</button>';
        }
        html += '</div>';
        document.getElementById('spots-container').innerHTML = html;
    }

    // ============================================================
    // MAIN APP LOGIC
    // ============================================================

    async function loadData() {
        var refreshBtn = document.getElementById('refresh-btn');
        refreshBtn.classList.add('spinning');

        // Step 1: Get user location (GPS or address)
        if (appState.locationMode === 'address') {
            var addressInput = document.getElementById('location-input');
            var query = addressInput.value.trim();
            if (!query) {
                refreshBtn.classList.remove('spinning');
                showError('Please enter an address or place name.', false);
                return;
            }
            showLoading('Looking up "' + query + '"...');
            var geo = await geocodeAddress(query);
            if (!geo) {
                refreshBtn.classList.remove('spinning');
                document.getElementById('location-status').innerHTML = '<span class="loc-error">Could not find that location. Try a different search.</span>';
                showError('Could not find "' + query + '". Try a town name like Akureyri or Vik.', false);
                return;
            }
            appState.userLat = geo.lat;
            appState.userLng = geo.lng;
            appState.addressName = geo.name;
            document.getElementById('location-status').innerHTML = 'Using: <span class="loc-name">' + geo.name + '</span>';
        } else {
            showLoading('Finding your location...');
            try {
                var loc = await getUserLocation();
                appState.userLat = loc.lat;
                appState.userLng = loc.lng;
                appState.addressName = null;
                document.getElementById('location-status').innerHTML = '';
            } catch (err) {
                refreshBtn.classList.remove('spinning');
                var msg = 'Location access is needed to find spots near you.';
                if (err.code === 1) {
                    msg = 'Location permission denied. Please enable location access in your browser settings and reload.';
                } else if (err.code === 2) {
                    msg = 'Could not determine your location. Make sure GPS is enabled.';
                } else if (err.code === 3) {
                    msg = 'Location request timed out. Please check your connection and try again.';
                }
                showError(msg, true);
                return;
            }
        }

        showLoading('Checking aurora activity...');

        // Step 2: Fetch aurora data
        var aurora = await fetchAuroraData();
        appState.kpCurrent = aurora.current;
        appState.kpForecast = aurora.forecast;

        renderAuroraStatus(appState.kpCurrent, appState.kpForecast);

        // Step 3: Calculate distances and filter by max drive time
        var now = new Date();
        var maxDrive = parseInt(document.getElementById('max-drive-time').value, 10);

        var spotsWithDistance = VIEWING_SPOTS.map(function (spot) {
            var dist = haversineDistance(appState.userLat, appState.userLng, spot.lat, spot.lng);
            var driveMin = estimateDriveMinutes(dist);
            return Object.assign({}, spot, {
                distanceKm: dist,
                driveMinutes: driveMin
            });
        });

        // Fetch cloud cover for all spots (needed for 48-hour forecast)
        showLoading('Checking cloud cover at ' + spotsWithDistance.length + ' locations...');

        // Step 4: Fetch cloud cover for all spots
        var cloudResults = await fetchCloudCoverForSpots(spotsWithDistance);
        var cloudMap = {};
        cloudResults.forEach(function (r) {
            cloudMap[r.spot.name] = r.cloudData;
        });

        // Step 5: Calculate sun times and visibility scores
        // Use user's location for sun calculations (close enough for all Iceland)
        var sunTimesToday = calcSunTimes(appState.userLat, appState.userLng, now);

        // Also calculate for tomorrow in case we're past midnight
        var tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        var sunTimesTomorrow = calcSunTimes(appState.userLat, appState.userLng, tomorrow);

        // Use today's sun times, but if sunrise already passed, use tomorrow's for "dark end"
        var sunTimes = sunTimesToday;
        if (sunTimes.sunrise && now > sunTimes.sunrise) {
            // We're past sunrise, recalculate from perspective of tonight
            sunTimes = sunTimesTomorrow;
        }

        renderDarknessInfo(sunTimes, now);

        var enrichedSpots = spotsWithDistance.map(function (spot) {
            var arrivalTime = new Date(now.getTime() + spot.driveMinutes * 60000);
            var cloudData = cloudMap[spot.name] || null;
            var cloudAtArrival = cloudData ? getCloudCoverAtTime(cloudData, arrivalTime) : null;
            var kpAtArrival = getKpAtTime(appState.kpForecast, arrivalTime);

            // Use spot-specific sun times for accuracy
            var spotSunTimes = calcSunTimes(spot.lat, spot.lng, arrivalTime);
            var isDark = isDarkForAurora(spotSunTimes, arrivalTime);
            var hoursRemaining = getHoursOfDarknessRemaining(spotSunTimes, arrivalTime);

            var score = calculateSpotScore(spot, cloudAtArrival, kpAtArrival, isDark, hoursRemaining, spot.driveMinutes);

            return Object.assign({}, spot, {
                arrivalTime: arrivalTime,
                cloudAtArrival: cloudAtArrival,
                kpAtArrival: kpAtArrival,
                isDarkAtArrival: isDark,
                hoursRemaining: hoursRemaining,
                score: score
            });
        });

        // Step 6: Find best 48-hour forecast windows
        var bestWindows = findBestWindows(spotsWithDistance, cloudMap, appState.kpForecast, appState.userLat, appState.userLng);
        renderForecastWindows(bestWindows);

        // Step 7: Render current spot results
        renderSpotCards(enrichedSpots);

        appState.lastUpdated = now;
        document.getElementById('last-updated').innerHTML =
            '<div class="last-updated">Updated at ' + formatTime(now) + '</div>';

        refreshBtn.classList.remove('spinning');
    }

    // ---- Event Listeners ----
    document.getElementById('refresh-btn').addEventListener('click', function () {
        loadData();
    });

    document.getElementById('max-drive-time').addEventListener('change', function () {
        // Re-render with new filter without re-fetching
        if (appState.lastUpdated) {
            loadData();
        }
    });

    document.getElementById('sort-by').addEventListener('change', function () {
        if (appState.lastUpdated) {
            loadData();
        }
    });

    // ---- Location picker ----
    var gpsBtn = document.getElementById('loc-gps-btn');
    var addressBtn = document.getElementById('loc-address-btn');
    var addressRow = document.getElementById('location-address-row');
    var locationInput = document.getElementById('location-input');
    var locationGoBtn = document.getElementById('location-go-btn');

    gpsBtn.addEventListener('click', function () {
        gpsBtn.classList.add('active');
        addressBtn.classList.remove('active');
        addressRow.style.display = 'none';
        appState.locationMode = 'gps';
        document.getElementById('location-status').innerHTML = '';
        loadData();
    });

    addressBtn.addEventListener('click', function () {
        addressBtn.classList.add('active');
        gpsBtn.classList.remove('active');
        addressRow.style.display = 'flex';
        appState.locationMode = 'address';
        locationInput.focus();
    });

    locationGoBtn.addEventListener('click', function () {
        loadData();
    });

    locationInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            loadData();
        }
    });

    // ---- Init ----
    loadData();

})();
