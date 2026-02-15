// ============================================================
// Northern Lights Finder - Iceland
// A mobile-first app to find the best aurora viewing spots
// based on your location, aurora activity, cloud cover, and
// remaining darkness.
// ============================================================

(function () {
    'use strict';

    // ---- Iceland populated areas (light pollution sources) ----
    // Population-weighted: larger towns emit more light
    const LIGHT_SOURCES = [
        { name: 'Reykjavik', lat: 64.1466, lng: -21.9426, pop: 140000 },
        { name: 'Kopavogur', lat: 64.1101, lng: -21.9132, pop: 38000 },
        { name: 'Hafnarfjordur', lat: 64.0671, lng: -21.9538, pop: 30000 },
        { name: 'Akureyri', lat: 65.6835, lng: -18.0878, pop: 19000 },
        { name: 'Keflavik', lat: 64.0048, lng: -22.5628, pop: 16000 },
        { name: 'Selfoss', lat: 63.9330, lng: -20.9971, pop: 8000 },
        { name: 'Akranes', lat: 64.3218, lng: -22.0756, pop: 7500 },
        { name: 'Ísafjörður', lat: 66.0750, lng: -23.1350, pop: 2600 },
        { name: 'Vestmannaeyjar', lat: 63.4437, lng: -20.2690, pop: 4500 },
        { name: 'Egilsstadir', lat: 65.2667, lng: -14.3948, pop: 2500 },
        { name: 'Hella', lat: 63.8369, lng: -20.3761, pop: 800 },
        { name: 'Hvolsvöllur', lat: 63.7496, lng: -20.2258, pop: 900 },
        { name: 'Vik', lat: 63.4186, lng: -19.0060, pop: 750 },
        { name: 'Höfn', lat: 64.2539, lng: -15.2082, pop: 2200 },
        { name: 'Húsavík', lat: 66.0449, lng: -17.3380, pop: 2300 },
        { name: 'Dalvík', lat: 65.9696, lng: -18.5284, pop: 1400 },
        { name: 'Blönduós', lat: 65.6620, lng: -20.2871, pop: 900 },
        { name: 'Sauðárkrókur', lat: 65.7465, lng: -19.6394, pop: 2600 },
        { name: 'Borgarnes', lat: 64.5383, lng: -21.9200, pop: 2000 }
    ];

    // Compass directions for generating nearby points (every 30 degrees)
    var DIRECTIONS = [
        { name: 'N',   bearing: 0 },
        { name: 'NNE', bearing: 30 },
        { name: 'ENE', bearing: 60 },
        { name: 'E',   bearing: 90 },
        { name: 'ESE', bearing: 120 },
        { name: 'SSE', bearing: 150 },
        { name: 'S',   bearing: 180 },
        { name: 'SSW', bearing: 210 },
        { name: 'WSW', bearing: 240 },
        { name: 'W',   bearing: 270 },
        { name: 'WNW', bearing: 300 },
        { name: 'NNW', bearing: 330 }
    ];

    // Distances in km to generate candidate points
    var NEARBY_DISTANCES = [5, 10, 15, 20, 30, 40];

    // ---- Kp index interpretation for Iceland's latitude (63-66 N) ----
    // At these latitudes, aurora is visible at lower Kp values
    const KP_INFO = [
        { min: 0, max: 1, label: 'Quiet', color: '#ff4466' },
        { min: 1, max: 2, label: 'Low', color: '#ff6644' },
        { min: 2, max: 3, label: 'Moderate', color: '#ffaa00' },
        { min: 3, max: 4, label: 'Active', color: '#aadd00' },
        { min: 4, max: 5, label: 'Strong', color: '#00e87b' },
        { min: 5, max: 6, label: 'Strong+', color: '#00e87b' },
        { min: 6, max: 7, label: 'Very Strong', color: '#00ccff' },
        { min: 7, max: 9, label: 'Intense', color: '#aa66ff' }
    ];

    // Minimum Kp needed to see aurora at a given magnetic latitude
    // Rough thresholds based on NOAA auroral oval models
    function getMinKpForLatitude(lat) {
        var absLat = Math.abs(lat);
        if (absLat >= 66) return 1;  // Arctic circle — almost always in the oval
        if (absLat >= 64) return 2;  // Iceland
        if (absLat >= 60) return 3;  // Southern Norway, Scotland
        if (absLat >= 55) return 5;  // Northern England, Denmark
        if (absLat >= 50) return 7;  // Central Europe
        if (absLat >= 45) return 8;  // Southern France, Northern Italy
        return 9; // Very unlikely below 45°
    }

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
        addressName: null,    // display name when using address mode
        pendingGeo: null      // selected autocomplete result awaiting loadData
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
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
    // ELEVATION / TERRAIN FLATNESS (Open-Meteo Elevation API)
    // ============================================================

    async function fetchElevationBatch(lats, lngs) {
        // Open-Meteo Elevation API: free, no key, CORS-enabled, batch support
        try {
            var url = 'https://api.open-meteo.com/v1/elevation'
                + '?latitude=' + lats.map(function (l) { return l.toFixed(4); }).join(',')
                + '&longitude=' + lngs.map(function (l) { return l.toFixed(4); }).join(',');

            var res = await fetch(url);
            if (!res.ok) return null;
            var data = await res.json();
            return data.elevation; // array of elevations in meters
        } catch (e) {
            console.warn('Elevation API error:', e);
            return null;
        }
    }

    async function enrichWithTerrain(candidates) {
        // For each candidate, sample 5 points: center + 4 cardinal directions at ~1km
        // Low elevation variance = flat & open terrain (ideal for aurora viewing)
        var probeDist = 1; // km
        var allLats = [];
        var allLngs = [];

        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            // Center point
            allLats.push(c.lat);
            allLngs.push(c.lng);
            // North probe
            var pN = pointAtBearing(c.lat, c.lng, 0, probeDist);
            allLats.push(pN.lat); allLngs.push(pN.lng);
            // East probe
            var pE = pointAtBearing(c.lat, c.lng, 90, probeDist);
            allLats.push(pE.lat); allLngs.push(pE.lng);
            // South probe
            var pS = pointAtBearing(c.lat, c.lng, 180, probeDist);
            allLats.push(pS.lat); allLngs.push(pS.lng);
            // West probe
            var pW = pointAtBearing(c.lat, c.lng, 270, probeDist);
            allLats.push(pW.lat); allLngs.push(pW.lng);
        }

        // Batch API calls in chunks of 100 (API limit per request)
        var CHUNK = 100;
        var allElev = [];

        for (var start = 0; start < allLats.length; start += CHUNK) {
            var cLats = allLats.slice(start, start + CHUNK);
            var cLngs = allLngs.slice(start, start + CHUNK);
            var elevations = await fetchElevationBatch(cLats, cLngs);
            if (elevations) {
                allElev = allElev.concat(elevations);
            } else {
                for (var j = 0; j < cLats.length; j++) allElev.push(null);
            }
        }

        // Calculate flatness for each candidate (5 probes per candidate)
        for (var i = 0; i < candidates.length; i++) {
            var base = i * 5;
            var probes = allElev.slice(base, base + 5);

            if (probes.some(function (p) { return p === null || p === undefined; })) {
                candidates[i].flatness = null;
                candidates[i].terrainLabel = 'Unknown';
                candidates[i].elevationCenter = null;
                continue;
            }

            // Standard deviation of elevation across 5 points = terrain roughness
            var mean = 0;
            for (var j = 0; j < probes.length; j++) mean += probes[j];
            mean /= probes.length;

            var variance = 0;
            for (var j = 0; j < probes.length; j++) {
                variance += (probes[j] - mean) * (probes[j] - mean);
            }
            variance /= probes.length;
            var stdDev = Math.sqrt(variance);

            candidates[i].elevationCenter = Math.round(probes[0]);
            candidates[i].elevationStdDev = stdDev;

            // Flatness score: 0-100 where 100 = perfectly flat
            if (stdDev <= 5) {
                candidates[i].flatness = 100;
                candidates[i].terrainLabel = 'Very flat & open';
            } else if (stdDev <= 15) {
                candidates[i].flatness = 80;
                candidates[i].terrainLabel = 'Flat terrain';
            } else if (stdDev <= 30) {
                candidates[i].flatness = 55;
                candidates[i].terrainLabel = 'Gently rolling';
            } else if (stdDev <= 60) {
                candidates[i].flatness = 30;
                candidates[i].terrainLabel = 'Hilly';
            } else {
                candidates[i].flatness = 10;
                candidates[i].terrainLabel = 'Mountainous';
            }
        }
    }

    // ============================================================
    // GEOCODING (Nominatim / OpenStreetMap — free, no API key)
    // Supports addresses, place names, and business names
    // ============================================================

    async function geocodeSearch(query) {
        // Returns array of results for autocomplete
        try {
            var url = 'https://nominatim.openstreetmap.org/search'
                + '?q=' + encodeURIComponent(query)
                + '&format=jsonv2'
                + '&limit=5'
                + '&countrycodes=is'
                + '&addressdetails=1'
                + '&accept-language=en';

            var res = await fetch(url, {
                headers: { 'User-Agent': 'NorthernLightsFinder/1.0' }
            });
            if (!res.ok) return [];
            var data = await res.json();

            return data.map(function (r) {
                return {
                    lat: parseFloat(r.lat),
                    lng: parseFloat(r.lon),
                    name: r.display_name,
                    shortName: buildShortName(r)
                };
            });
        } catch (e) {
            console.warn('Geocoding error:', e);
        }
        return [];
    }

    function buildShortName(r) {
        // Build a concise display name from Nominatim result
        var parts = [];
        if (r.name && r.name !== r.address.road) parts.push(r.name);
        if (r.address) {
            if (r.address.road) parts.push(r.address.road);
            if (r.address.town) parts.push(r.address.town);
            else if (r.address.village) parts.push(r.address.village);
            else if (r.address.city) parts.push(r.address.city);
        }
        if (parts.length === 0) return r.display_name.split(',').slice(0, 2).join(',');
        return parts.join(', ');
    }

    // Debounce helper for autocomplete
    var searchTimer = null;
    function debounceSearch(fn, delay) {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(fn, delay);
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
    // NEARBY DARK-SKY SPOT GENERATION
    // ============================================================

    function pointAtBearing(lat, lng, bearingDeg, distKm) {
        // Calculate a new lat/lng given a start point, bearing, and distance
        var R = 6371;
        var latRad = toRad(lat);
        var lngRad = toRad(lng);
        var brng = toRad(bearingDeg);
        var d = distKm / R;

        var newLat = Math.asin(
            Math.sin(latRad) * Math.cos(d) +
            Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
        );
        var newLng = lngRad + Math.atan2(
            Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
            Math.cos(d) - Math.sin(latRad) * Math.sin(newLat)
        );

        return { lat: toDeg(newLat), lng: toDeg(newLng) };
    }

    function getLightPollutionScore(lat, lng) {
        // Returns 0-100 where 0 = very dark (good) and 100 = bright (bad)
        // Based on inverse-square-law contributions from all towns
        var totalLight = 0;

        for (var i = 0; i < LIGHT_SOURCES.length; i++) {
            var src = LIGHT_SOURCES[i];
            var dist = haversineDistance(lat, lng, src.lat, src.lng);
            if (dist < 1) dist = 1; // avoid division by zero
            // Light pollution falls off roughly with distance squared
            // Population scales the brightness
            totalLight += (src.pop / 1000) / (dist * dist) * 100;
        }

        // Normalize: Reykjavik center ~ 100, remote countryside ~ 0-5
        return Math.min(100, totalLight);
    }

    function generateNearbyCandidates(userLat, userLng) {
        // Generate candidate points in 12 directions x 6 distances = 72 candidates
        var candidates = [];

        for (var d = 0; d < NEARBY_DISTANCES.length; d++) {
            var dist = NEARBY_DISTANCES[d];
            for (var i = 0; i < DIRECTIONS.length; i++) {
                var dir = DIRECTIONS[i];
                var pt = pointAtBearing(userLat, userLng, dir.bearing, dist);
                var lightPollution = getLightPollutionScore(pt.lat, pt.lng);
                var driveMin = estimateDriveMinutes(dist);

                candidates.push({
                    name: dist + ' km ' + dir.name,
                    lat: pt.lat,
                    lng: pt.lng,
                    desc: 'Drive ' + dir.name + ' for ' + driveMin + ' min',
                    distanceKm: dist,
                    driveMinutes: driveMin,
                    lightPollution: lightPollution,
                    direction: dir.name,
                    isNearby: true
                });
            }
        }

        return candidates;
    }

    function filterAndRankCandidates(candidates) {
        // Filter: must be on land, dark, and reasonably flat
        var filtered = candidates.filter(function (c) {
            if (c.elevationCenter !== null && c.elevationCenter <= 0) return false; // in the ocean
            if (c.lightPollution > 15) return false; // too close to towns
            if (c.flatness !== null && c.flatness < 30) return false; // too hilly
            return true;
        });

        // Compute a site quality score combining darkness and flatness
        filtered.forEach(function (c) {
            var darknessScore = Math.max(0, 100 - c.lightPollution * 6.67); // 0-100
            var flatScore = c.flatness !== null ? c.flatness : 50; // default moderate
            c.siteQuality = darknessScore * 0.6 + flatScore * 0.4;
        });

        // Sort by site quality and keep the best per direction
        filtered.sort(function (a, b) { return b.siteQuality - a.siteQuality; });

        var bestPerDirection = {};
        filtered.forEach(function (c) {
            if (!bestPerDirection[c.direction] || c.siteQuality > bestPerDirection[c.direction].siteQuality) {
                bestPerDirection[c.direction] = c;
            }
        });

        var result = Object.values(bestPerDirection);
        result.sort(function (a, b) { return b.siteQuality - a.siteQuality; });

        return result;
    }

    // ============================================================
    // VISIBILITY SCORING
    // ============================================================

    function getKpAtTime(forecast, targetTime) {
        // Find the forecast Kp closest to targetTime
        if (!forecast || forecast.length === 0) return appState.kpCurrent || 0;

        var target = targetTime.getTime();
        var now = Date.now();
        var closest = forecast[0];
        var closestDiff = Math.abs(forecast[0].time.getTime() - target);

        for (var i = 1; i < forecast.length; i++) {
            var diff = Math.abs(forecast[i].time.getTime() - target);
            if (diff < closestDiff) {
                closest = forecast[i];
                closestDiff = diff;
            }
        }

        // For arrivals within the next ~3 hours, use the real-time observed Kp
        // if it's higher than the forecast — the observation is more accurate
        // than the prediction for the near term
        var hoursFromNow = (target - now) / 3600000;
        if (hoursFromNow < 3 && appState.kpCurrent !== null) {
            return Math.max(closest.kp, appState.kpCurrent);
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

        // Flat terrain bonus (0-5 points)
        if (spot.flatness !== null && spot.flatness !== undefined) {
            if (spot.flatness >= 80) score += 5;
            else if (spot.flatness >= 50) score += 3;
        }

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

        var minKp = appState.userLat !== null ? getMinKpForLatitude(appState.userLat) : 2;
        var visibleAtLocation = kpCurrent >= minKp;
        var visibleText;
        if (visibleAtLocation) {
            visibleText = '<span style="color:' + info.color + '">Visible to naked eye at your latitude</span>';
        } else {
            visibleText = '<span style="color:var(--text-secondary)">Need Kp ' + minKp + '+ to see aurora at your latitude</span>';
        }

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

    function renderDarknessInfo(sunTimesToday, sunTimesTomorrow, now) {
        var container = document.getElementById('darkness-info');

        if (sunTimesToday.midnightSun) {
            container.innerHTML = '<div class="darkness-info error-text">'
                + 'It\'s midnight sun season — the sky won\'t get dark enough for aurora viewing.'
                + '</div>';
            return;
        }

        if (sunTimesToday.polarNight) {
            container.innerHTML = '<div class="darkness-info">'
                + 'Polar night — dark all day. Perfect conditions for aurora viewing.'
                + '</div>';
            return;
        }

        // Always check "is it dark RIGHT NOW?" using today's sun times
        var darkNow = isDarkForAurora(sunTimesToday, now);

        if (darkNow) {
            var hoursLeft = getHoursOfDarknessRemaining(sunTimesToday, now);
            var endTime = sunTimesToday.astroTwilightEnd || sunTimesToday.sunrise;
            var endStr = formatTime(endTime);
            container.innerHTML = '<div class="darkness-info">'
                + 'Sky is <strong style="color:var(--accent)">dark enough</strong> for aurora viewing. '
                + 'Darkness until <strong>' + endStr + '</strong> (~' + hoursLeft.toFixed(1) + ' hrs remaining)'
                + '</div>';
        } else {
            // Find when darkness will NEXT begin
            var nextDarkStart = sunTimesToday.astroTwilightStart || sunTimesToday.sunset;
            // If today's dark start already passed, use tomorrow's
            if (!nextDarkStart || nextDarkStart.getTime() <= now.getTime()) {
                nextDarkStart = sunTimesTomorrow.astroTwilightStart || sunTimesTomorrow.sunset;
            }
            if (nextDarkStart && nextDarkStart.getTime() > now.getTime()) {
                var startStr = formatTime(nextDarkStart);
                var hoursUntil = ((nextDarkStart.getTime() - now.getTime()) / 3600000).toFixed(1);
                container.innerHTML = '<div class="darkness-info">'
                    + 'Sky is <strong style="color:var(--warning)">not dark enough</strong> right now. '
                    + 'Darkness begins at <strong>' + startStr + '</strong> (~' + hoursUntil + ' hrs from now)'
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
                + '<button class="navigate-btn forecast-nav-btn" data-lat="' + w.spot.lat + '" data-lng="' + w.spot.lng + '" data-name="' + w.spot.name + '">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'
                + '<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>'
                + 'Navigate to ' + w.spot.name
                + '</button>'
                + '</div>';
        }

        html += '</div></div>';
        container.innerHTML = html;

        // Attach navigation click handlers to forecast cards
        var forecastNavBtns = container.querySelectorAll('.forecast-nav-btn');
        forecastNavBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var lat = parseFloat(btn.dataset.lat);
                var lng = parseFloat(btn.dataset.lng);
                var name = btn.dataset.name;
                openNavigation(lat, lng, name);
            });
        });
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

    function renderNearbySpots(spots) {
        var container = document.getElementById('nearby-container');

        // Sort by score descending
        var sorted = spots.slice().sort(function (a, b) { return b.score - a.score; });

        // Apply max drive filter
        var maxDrive = parseInt(document.getElementById('max-drive-time').value, 10);
        sorted = sorted.filter(function (s) { return s.driveMinutes <= maxDrive; });

        if (sorted.length === 0) {
            container.innerHTML = '<div class="section-label">Dark-sky viewing spots</div>'
                + '<div class="no-spots-message">No suitable spots found within your drive time. '
                + 'Try increasing the max drive distance.</div>';
            return;
        }

        var locLabel = appState.addressName ? ' near ' + appState.addressName.split(',')[0] : ' near you';
        var html = '<div class="section-label">Dark-sky viewing spots' + locLabel + ' (' + sorted.length + ' found)</div>'
            + '<div class="nearby-hint">Flat, dark locations away from town lights — ranked by viewing conditions</div>'
            + '<div class="nearby-list">';

        for (var i = 0; i < sorted.length; i++) {
            var s = sorted[i];
            var kpInfo = getKpInfo(s.kpAtArrival);

            var cloudKnown = s.cloudAtArrival !== null;
            var clearPct = cloudKnown ? (100 - s.cloudAtArrival) : null;
            var clearLabel = clearPct !== null ? (clearPct + '% clear') : 'No data';
            var clearColor = clearPct !== null
                ? (clearPct >= 70 ? 'var(--accent)' : clearPct >= 40 ? 'var(--warning)' : 'var(--danger)')
                : 'var(--text-secondary)';

            var darkLabel = s.lightPollution < 3 ? 'Very dark' : s.lightPollution < 8 ? 'Dark' : 'Moderate';
            var darkColor = s.lightPollution < 3 ? 'var(--accent)' : s.lightPollution < 8 ? '#66f0a8' : 'var(--warning)';

            var terrainLabel = s.terrainLabel || 'Unknown';
            var terrainColor = s.flatness >= 80 ? 'var(--accent)' : s.flatness >= 50 ? '#66f0a8' : 'var(--warning)';
            var elevLabel = s.elevationCenter !== null ? (s.elevationCenter + 'm elev') : '';

            var badgeClass, badgeText;
            if (!s.isDarkAtArrival) { badgeClass = 'badge-poor'; badgeText = 'Not visible'; }
            else if (s.score >= 70) { badgeClass = 'badge-great'; badgeText = 'Great'; }
            else if (s.score >= 55) { badgeClass = 'badge-good'; badgeText = 'Good'; }
            else if (s.score >= 35) { badgeClass = 'badge-fair'; badgeText = 'Fair'; }
            else if (s.cloudAtArrival !== null && s.cloudAtArrival >= 90) { badgeClass = 'badge-poor'; badgeText = 'Not visible'; }
            else { badgeClass = 'badge-poor'; badgeText = 'Poor'; }

            // Verdict text based on conditions
            var verdictClass, verdictText;
            var overcast = s.cloudAtArrival !== null && s.cloudAtArrival >= 90;
            var heavyClouds = s.cloudAtArrival !== null && s.cloudAtArrival >= 70;

            if (!s.isDarkAtArrival) {
                verdictClass = 'verdict-negative';
                verdictText = 'Not dark yet — aurora is only visible at night';
            } else if (overcast) {
                verdictClass = 'verdict-negative';
                verdictText = 'Overcast — clouds will block the view';
            } else if (heavyClouds) {
                verdictClass = 'verdict-negative';
                verdictText = 'Heavy cloud cover — very unlikely to see aurora';
            } else if (s.score >= 55) {
                verdictClass = 'verdict-positive';
                verdictText = 'Aurora likely visible — ' + s.hoursRemaining.toFixed(1) + ' hrs of darkness left';
            } else if (s.score >= 35) {
                verdictClass = 'verdict-caution';
                verdictText = 'Possible viewing — conditions are marginal';
            } else {
                verdictClass = 'verdict-negative';
                verdictText = 'Low chance right now';
            }

            html += '<div class="nearby-card' + (i === 0 ? ' top-pick' : '') + '">'
                + '<div class="nearby-card-header">'
                + '  <div>'
                + '    <div class="nearby-direction">' + s.name + '</div>'
                + '    <div class="nearby-subtitle">~' + s.driveMinutes + ' min drive &middot; ' + s.distanceKm.toFixed(0) + ' km away</div>'
                + '  </div>'
                + '  <span class="spot-badge ' + badgeClass + '">' + badgeText + '</span>'
                + '</div>'
                + '<div class="nearby-tags">'
                + '  <span class="nearby-tag" style="color:' + darkColor + '">' + darkLabel + '</span>'
                + '  <span class="nearby-tag" style="color:' + terrainColor + '">' + terrainLabel + '</span>'
                + '  <span class="nearby-tag" style="color:' + clearColor + '">' + clearLabel + '</span>'
                + '  <span class="nearby-tag" style="color:' + kpInfo.color + '">Kp ' + s.kpAtArrival.toFixed(1) + '</span>'
                + (elevLabel ? '  <span class="nearby-tag">' + elevLabel + '</span>' : '')
                + '</div>'
                + '<div class="spot-verdict ' + verdictClass + '">' + verdictText + '</div>'
                + '<button class="navigate-btn nearby-nav-btn" data-lat="' + s.lat + '" data-lng="' + s.lng + '" data-name="' + s.name + '">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'
                + '<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>'
                + 'Navigate ' + s.name
                + '</button>'
                + '</div>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Attach navigation click handlers
        var navBtns = container.querySelectorAll('.nearby-nav-btn');
        navBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var lat = parseFloat(btn.dataset.lat);
                var lng = parseFloat(btn.dataset.lng);
                var name = btn.dataset.name;
                openNavigation(lat, lng, name);
            });
        });
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
        document.getElementById('nearby-container').innerHTML =
            '<div class="loading"><div class="loading-spinner"></div><p>' + message + '</p></div>';
    }

    function showError(message, showRetry) {
        var html = '<div class="message-box"><p>' + message + '</p>';
        if (showRetry) {
            html += '<button class="action-btn" onclick="location.reload()">Try again</button>';
        }
        html += '</div>';
        document.getElementById('nearby-container').innerHTML = html;
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
            // If user already picked an autocomplete result, use the stored coords
            if (appState.pendingGeo) {
                appState.userLat = appState.pendingGeo.lat;
                appState.userLng = appState.pendingGeo.lng;
                appState.addressName = appState.pendingGeo.shortName || appState.pendingGeo.name;
                appState.pendingGeo = null;
            } else {
                showLoading('Looking up "' + query + '"...');
                var results = await geocodeSearch(query);
                if (!results || results.length === 0) {
                    refreshBtn.classList.remove('spinning');
                    document.getElementById('location-status').innerHTML = '<span class="loc-error">Could not find that location. Try a different search.</span>';
                    showError('Could not find "' + query + '". Try an address, town, or business name in Iceland.', false);
                    return;
                }
                var geo = results[0];
                appState.userLat = geo.lat;
                appState.userLng = geo.lng;
                appState.addressName = geo.shortName || geo.name;
            }
            document.getElementById('location-status').innerHTML = 'Using: <span class="loc-name">' + appState.addressName + '</span>';
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

                // Auto-switch to address mode so the user isn't stuck
                var gpsBtnEl = document.getElementById('loc-gps-btn');
                var addrBtnEl = document.getElementById('loc-address-btn');
                var addrRowEl = document.getElementById('location-address-row');
                addrBtnEl.classList.add('active');
                gpsBtnEl.classList.remove('active');
                addrRowEl.style.display = 'flex';
                appState.locationMode = 'address';

                var msg;
                if (err.code === 1) {
                    msg = 'GPS permission denied — enter your location below instead.';
                } else if (err.code === 2) {
                    msg = 'Could not get GPS position — enter your location below instead.';
                } else if (err.code === 3) {
                    msg = 'GPS timed out — enter your location below instead.';
                } else {
                    msg = 'GPS unavailable — enter your location below instead.';
                }
                document.getElementById('location-status').innerHTML = '<span class="loc-error">' + msg + '</span>';
                document.getElementById('location-input').focus();
                showError(msg, false);
                return;
            }
        }

        // Check if user is in/near Iceland (lat 63-67, lng -13 to -25)
        var inIceland = appState.userLat >= 62.5 && appState.userLat <= 67.5
            && appState.userLng >= -25.5 && appState.userLng <= -12.5;
        var locationWarning = document.getElementById('location-warning');
        if (!inIceland) {
            locationWarning.innerHTML = '<div class="location-warning-box">'
                + 'You appear to be outside Iceland. This app\'s spot-finding, light pollution model, '
                + 'and drive time estimates are designed for Iceland. '
                + 'Use the <strong>Enter address</strong> tab to set your Iceland location for trip planning.'
                + '</div>';
        } else {
            locationWarning.innerHTML = '';
        }

        showLoading('Checking aurora activity...');

        // Step 2: Fetch aurora data
        var aurora = await fetchAuroraData();
        appState.kpCurrent = aurora.current;
        appState.kpForecast = aurora.forecast;

        renderAuroraStatus(appState.kpCurrent, appState.kpForecast);

        // Step 3: Generate candidate dark-sky points (12 directions x 6 distances)
        var now = new Date();
        showLoading('Scanning for dark, flat locations...');
        var candidates = generateNearbyCandidates(appState.userLat, appState.userLng);

        // Step 4: Fetch terrain elevation data for all candidates
        showLoading('Checking terrain at ' + candidates.length + ' locations...');
        await enrichWithTerrain(candidates);

        // Step 5: Filter to dark, flat spots
        var nearbySpots = filterAndRankCandidates(candidates);

        // Step 6: Fetch cloud cover for filtered spots only
        showLoading('Checking cloud cover at ' + nearbySpots.length + ' locations...');
        var cloudResults = await fetchCloudCoverForSpots(nearbySpots);
        var cloudMap = {};
        cloudResults.forEach(function (r) {
            cloudMap[r.spot.name] = r.cloudData;
        });

        // Step 7: Calculate sun times and darkness info
        var sunTimesToday = calcSunTimes(appState.userLat, appState.userLng, now);

        var tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        var sunTimesTomorrow = calcSunTimes(appState.userLat, appState.userLng, tomorrow);

        renderDarknessInfo(sunTimesToday, sunTimesTomorrow, now);

        // Step 8: Enrich spots with viewing condition scores
        function enrichSpot(spot) {
            var arrivalTime = new Date(now.getTime() + spot.driveMinutes * 60000);
            var cloudData = cloudMap[spot.name] || null;
            var cloudAtArrival = cloudData ? getCloudCoverAtTime(cloudData, arrivalTime) : null;
            var kpAtArrival = getKpAtTime(appState.kpForecast, arrivalTime);

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
        }

        var enrichedNearby = nearbySpots.map(enrichSpot);

        // Step 9: Find best 48-hour forecast windows
        var bestWindows = findBestWindows(nearbySpots, cloudMap, appState.kpForecast, appState.userLat, appState.userLng);
        renderForecastWindows(bestWindows);

        // Step 10: Render results
        renderNearbySpots(enrichedNearby);

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


    // ---- Glossary modal ----
    var glossaryBtn = document.getElementById('glossary-btn');
    var glossaryOverlay = document.getElementById('glossary-overlay');
    var glossaryModal = document.getElementById('glossary-modal');
    var glossaryClose = document.getElementById('glossary-close');

    function openGlossary() {
        glossaryOverlay.classList.add('open');
        glossaryModal.classList.add('open');
    }

    function closeGlossary() {
        glossaryOverlay.classList.remove('open');
        glossaryModal.classList.remove('open');
    }

    glossaryBtn.addEventListener('click', openGlossary);
    glossaryClose.addEventListener('click', closeGlossary);
    glossaryOverlay.addEventListener('click', closeGlossary);

    // ---- Location picker ----
    var gpsBtn = document.getElementById('loc-gps-btn');
    var addressBtn = document.getElementById('loc-address-btn');
    var addressRow = document.getElementById('location-address-row');
    var locationInput = document.getElementById('location-input');
    var locationGoBtn = document.getElementById('location-go-btn');
    var acDropdown = document.getElementById('autocomplete-dropdown');
    var acHighlightIdx = -1;
    var acResults = [];

    gpsBtn.addEventListener('click', function () {
        gpsBtn.classList.add('active');
        addressBtn.classList.remove('active');
        addressRow.style.display = 'none';
        appState.locationMode = 'gps';
        appState.pendingGeo = null;
        document.getElementById('location-status').innerHTML = '';
        closeAutocomplete();
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
        closeAutocomplete();
        loadData();
    });

    locationInput.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            acHighlightIdx = Math.min(acHighlightIdx + 1, acResults.length - 1);
            updateAcHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            acHighlightIdx = Math.max(acHighlightIdx - 1, -1);
            updateAcHighlight();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (acHighlightIdx >= 0 && acResults[acHighlightIdx]) {
                selectAcResult(acResults[acHighlightIdx]);
            } else {
                closeAutocomplete();
                loadData();
            }
        } else if (e.key === 'Escape') {
            closeAutocomplete();
        }
    });

    locationInput.addEventListener('input', function () {
        var query = locationInput.value.trim();
        if (query.length < 2) {
            closeAutocomplete();
            return;
        }
        debounceSearch(function () {
            showAcLoading();
            geocodeSearch(query).then(function (results) {
                acResults = results;
                acHighlightIdx = -1;
                renderAcResults(results);
            });
        }, 350);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.location-input-wrapper')) {
            closeAutocomplete();
        }
    });

    function showAcLoading() {
        acDropdown.innerHTML = '<div class="autocomplete-loading">Searching...</div>';
        acDropdown.classList.add('open');
    }

    function renderAcResults(results) {
        if (!results || results.length === 0) {
            acDropdown.innerHTML = '<div class="autocomplete-loading">No results found</div>';
            acDropdown.classList.add('open');
            return;
        }
        var html = '';
        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            var mainName = r.shortName;
            var detail = r.name.length > mainName.length ? r.name : '';
            html += '<div class="autocomplete-item" data-index="' + i + '">'
                + '<div class="ac-main">' + escapeHtml(mainName) + '</div>'
                + (detail ? '<div class="ac-detail">' + escapeHtml(detail) + '</div>' : '')
                + '</div>';
        }
        acDropdown.innerHTML = html;
        acDropdown.classList.add('open');

        // Attach click handlers
        var items = acDropdown.querySelectorAll('.autocomplete-item');
        items.forEach(function (item) {
            item.addEventListener('click', function () {
                var idx = parseInt(item.dataset.index, 10);
                if (acResults[idx]) {
                    selectAcResult(acResults[idx]);
                }
            });
        });
    }

    function selectAcResult(result) {
        locationInput.value = result.shortName;
        appState.pendingGeo = result;
        closeAutocomplete();
        loadData();
    }

    function closeAutocomplete() {
        acDropdown.classList.remove('open');
        acDropdown.innerHTML = '';
        acResults = [];
        acHighlightIdx = -1;
    }

    function updateAcHighlight() {
        var items = acDropdown.querySelectorAll('.autocomplete-item');
        items.forEach(function (item, i) {
            if (i === acHighlightIdx) {
                item.classList.add('highlighted');
            } else {
                item.classList.remove('highlighted');
            }
        });
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---- Init ----
    loadData();

})();
