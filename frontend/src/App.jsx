import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Activity, Bell, Camera, CloudRain, CloudSun, Droplets, Info, LayoutDashboard, Leaf, MapPin, ScanLine, Search, ShieldCheck, Smartphone, Sprout, Sun, Upload, Wind, X } from 'lucide-react';
import './weather.css';
import './insights.css';
import AboutPage from './AboutPage.jsx';
import HomePage from './HomePage.jsx';
import MobileAccessModal from './MobileAccessModal.jsx';
import { diseaseWeatherCue, getPlantGuidance } from './plant-guidance.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const conditions = { 0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 51: 'Drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 95: 'Thunderstorm' };
const prettify = (s = '') => s.replaceAll('___', ' · ').replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
const condition = (n) => (n == null ? 'Forecast' : conditions[n] || 'Variable conditions');
const percent = (n) => `${(Number(n || 0) * 100).toFixed(1)}%`;

async function readJson(response, requestName) {
  const body = await response.text();
  if (!body.trim()) {
    if (!response.ok) return { detail: `${requestName} failed with HTTP ${response.status} and an empty response.` };
    throw new Error(`${requestName} returned an empty response (HTTP ${response.status}). Check the API service and its logs.`);
  }

  try {
    return JSON.parse(body);
  } catch {
    if (!response.ok) return { detail: `${requestName} failed with HTTP ${response.status} and a non-JSON response.` };
    throw new Error(`${requestName} returned a non-JSON response (HTTP ${response.status}). Check the API URL and server logs.`);
  }
}

function formatApiDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return String(item);
      const location = Array.isArray(item.loc) ? `${item.loc.join('.')}: ` : '';
      return `${location}${item.msg || JSON.stringify(item)}`;
    }).join(' · ');
  }
  if (detail && typeof detail === 'object') return detail.message || detail.msg || JSON.stringify(detail);
  return '';
}

function ForecastDiagram({ daily }) {
  if (!daily?.time?.length) return <div className="forecast-empty">Waiting for the five-day forecast…</div>;
  return <div className="forecast-days" aria-label="Five-day temperature and rain forecast">
    {daily.time.slice(0, 5).map((day, index) => {
      const code = daily.weather_code?.[index];
      const ForecastIcon = code === 0 ? Sun : code >= 51 ? CloudRain : CloudSun;
      const high = daily.temperature_2m_max?.[index];
      const low = daily.temperature_2m_min?.[index];
      const rain = Math.max(0, Math.min(100, Number(daily.precipitation_probability_max?.[index] ?? 0)));
      return <article className="forecast-day" key={day}>
        <b>{index === 0 ? 'Today' : new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(`${day}T12:00:00`))}</b>
        <ForecastIcon size={25} strokeWidth={1.7} aria-hidden="true" />
        <span className="forecast-condition">{condition(code)}</span>
        <div className="forecast-temperatures"><strong>{high == null ? '—' : `${Math.round(high)}°`}</strong><span>{low == null ? '—' : `${Math.round(low)}°`}</span></div>
        <small><CloudRain size={12} /> {rain}%</small>
      </article>;
    })}
  </div>;
}

function CircleGauge({ label, value, tone = 'green', detail }) {
  const hasValue = value != null && Number.isFinite(Number(value));
  const safeValue = hasValue ? Math.max(0, Math.min(100, Number(value))) : 0;
  return <div className={`circle-gauge-card ${tone}`}>
    <div className="circle-gauge" style={{ '--gauge-angle': `${safeValue * 3.6}deg` }} role="img" aria-label={hasValue ? `${label}: ${Math.round(safeValue)} percent` : `${label}: no data`}>
      <div><strong>{hasValue ? `${Math.round(safeValue)}%` : '—'}</strong></div>
    </div>
    <b>{label}</b>
    {detail && <small>{detail}</small>}
  </div>;
}

function confidenceTone(confidence) {
  if (confidence >= 0.8) return 'green';
  if (confidence >= 0.6) return 'amber';
  return 'rose';
}

function weatherValueTone(value, moderate, elevated) {
  if (value == null || !Number.isFinite(Number(value))) return 'amber';
  if (Number(value) >= elevated) return 'rose';
  if (Number(value) >= moderate) return 'amber';
  return 'green';
}

function weatherFitTone(label) {
  if (label === 'favorable_now') return 'green';
  if (label === 'unfavorable') return 'rose';
  if (label === 'mixed') return 'amber';
  return 'neutral';
}

function weatherFitLabel(label) {
  return ({
    favorable_now: 'Suitable in this forecast',
    mixed: 'Partly suitable',
    unfavorable: 'Not suitable in this forecast',
    insufficient_data: 'Not enough weather data',
  })[label] || 'Not assessed';
}

function fallbackRemedyPoints(actions = []) {
  const safeActions = actions.length ? actions : ['Take a clear photo and ask a local agricultural extension professional to confirm the symptoms.'];
  return safeActions.map((solution) => {
    const text = solution.toLowerCase();
    if (/no disease pattern|healthy|routine scouting|routine monitoring/.test(text)) {
      return { action: 'Keep monitoring the plant', explanation: 'The image model did not identify a clear disease pattern, but a photo screening cannot rule out every plant problem.', solution };
    }
    if (/airflow|wetting foliage|leaf wetness|debris|remove affected|sanit|tool/.test(text)) {
      return { action: 'Reduce spread and leaf wetness', explanation: 'For many leaf diseases, wet foliage, crowded growth, and infected debris can help disease persist or spread.', solution };
    }
    if (/virus|vector|insect|mite|webbing/.test(text)) {
      return { action: 'Check for pests that can spread damage', explanation: 'Some pests can injure plants or carry disease between them, so early inspection helps guide safe next steps.', solution };
    }
    if (/inspect|confirm|symptom|clear photo|diagnos/.test(text)) {
      return { action: 'Confirm the symptoms', explanation: 'Different diseases and environmental stress can look alike, so checking more than one leaf helps avoid acting on the wrong cause.', solution };
    }
    if (/resistant variet|resistant crop/.test(text)) {
      return { action: 'Plan for a less susceptible variety', explanation: 'A resistant variety can reduce future disease pressure, though it will not cure a plant already showing symptoms.', solution };
    }
    return { action: 'Use crop-specific local guidance', explanation: 'Treatment depends on the crop, confirmed cause, and local conditions; general image screening is not enough to choose a treatment safely.', solution };
  });
}

function toCareWeatherSnapshot(data) {
  const asNumber = (value) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const current = data?.current || {};
  const daily = data?.daily || {};
  const location = data?.location || {};
  const forecast = (daily.time || []).slice(0, 5).map((date, index) => ({
    date,
    temperature_high_c: asNumber(daily.temperature_2m_max?.[index]),
    temperature_low_c: asNumber(daily.temperature_2m_min?.[index]),
    rain_probability_pct: asNumber(daily.precipitation_probability_max?.[index]),
    precipitation_mm: asNumber(daily.precipitation_sum?.[index]),
  }));

  return {
    location: [location.name, location.admin1, location.country].filter(Boolean).join(', ') || 'Selected city',
    current_temperature_c: asNumber(current.temperature_2m),
    relative_humidity_pct: asNumber(current.relative_humidity_2m),
    current_precipitation_mm: asNumber(current.precipitation),
    wind_speed_kmh: asNumber(current.wind_speed_10m),
    forecast_5_day: forecast,
  };
}

function Dashboard({ onMobileAccess }) {
  const root = useRef(null);
  const fileRef = useRef(null);
  const captureFileRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fileSource, setFileSource] = useState('upload');
  const [preview, setPreview] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [apiStatus, setApiStatus] = useState('checking');
  const [result, setResult] = useState(null);
  const [verifiedClass, setVerifiedClass] = useState('');
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelMessage, setLabelMessage] = useState('');
  const [carePlan, setCarePlan] = useState(null);
  const [countryWeatherFit, setCountryWeatherFit] = useState(null);
  const [countryWeatherFitBusy, setCountryWeatherFitBusy] = useState(false);
  const [countryWeatherFitError, setCountryWeatherFitError] = useState('');
  const [countryWeatherFitFilter, setCountryWeatherFitFilter] = useState('favorable_now');
  const [countryWeatherFitSearch, setCountryWeatherFitSearch] = useState('');
  const [countryWeatherFitReload, setCountryWeatherFitReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState('India');
  const [countryCode, setCountryCode] = useState('IN');
  const [regions, setRegions] = useState([]);
  const [region, setRegion] = useState('Karnataka');
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState('Bengaluru');
  const [weather, setWeather] = useState(null);
  const [weatherComparisons, setWeatherComparisons] = useState([]);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [countriesBusy, setCountriesBusy] = useState(true);
  const [regionsBusy, setRegionsBusy] = useState(false);
  const [citiesBusy, setCitiesBusy] = useState(false);
  const [locationListError, setLocationListError] = useState('');

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.sidebar, .topbar', { opacity: 0, y: -10, duration: 0.55, ease: 'power2.out' });
      gsap.from('.welcome, .dashboard-section', { opacity: 0, y: 18, duration: 0.65, stagger: 0.12, delay: 0.1, ease: 'power3.out' });
    }, root);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const section = window.location.hash.slice(1);
    if (!section) return undefined;
    const firstFrame = requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' })));
    return () => cancelAnimationFrame(firstFrame);
  }, []);

  useEffect(() => {
    if (cameraOpen && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
      void videoRef.current.play().catch(() => setCameraError('Camera preview could not start. Check browser permissions and try again.'));
    }
  }, [cameraOpen]);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function checkBackend() {
      try {
        const response = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
        const data = await readJson(response, 'Backend health check');
        setApiStatus(response.ok && data.status === 'ready' ? 'online' : response.ok ? 'limited' : 'offline');
      } catch (err) {
        if (err.name !== 'AbortError') setApiStatus('offline');
      }
    }
    void checkBackend();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!result?.history_id || !weather?.current || !weather?.daily) {
      setCarePlan(null);
      return undefined;
    }

    const controller = new AbortController();
    setCarePlan(null);
    async function requestCarePlan() {
      try {
        const response = await fetch(`${API_BASE}/api/care-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prediction_id: result.history_id,
            weather: toCareWeatherSnapshot(weather),
            comparison_weather: weatherComparisons.map(toCareWeatherSnapshot),
          }),
          signal: controller.signal,
        });
        const data = await readJson(response, 'Care plan request');
        if (!response.ok) throw new Error(formatApiDetail(data?.detail) || `ChatGPT request failed (${response.status}).`);
        if (!data?.plan?.crop_weather_fit || !Array.isArray(data.plan.remedy_points)) throw new Error('ChatGPT returned an incomplete care plan.');
        setCarePlan(data.plan);
      } catch (err) {
        if (err.name !== 'AbortError') setCarePlan(null);
      }
    }
    void requestCarePlan();
    return () => controller.abort();
  }, [result, weather, weatherComparisons]);

  async function loadWeather(event) {
    event?.preventDefault();
    setWeatherBusy(true); setWeatherError('');
    try {
      if (!city.trim()) throw new Error('Select a city first.');
      const params = new URLSearchParams();
      params.set('city', city.trim());
      if (region) params.set('admin1', region);
      if (country) params.set('country', country);
      if (countryCode) params.set('country_code', countryCode);
      const response = await fetch(`${API_BASE}/api/weather?${params.toString()}`, { signal: AbortSignal.timeout(30000) });
      const data = await readJson(response, 'Weather request');
      if (!response.ok) throw new Error(formatApiDetail(data?.detail) || `Weather request failed (${response.status}).`);
      if (!data?.current || !data?.daily || !data?.location) throw new Error('Weather service returned incomplete data. Please retry.');
      setWeather(data);
    } catch (err) {
      setWeatherError(err instanceof Error && err.name === 'TimeoutError' ? 'Weather request timed out. Please retry.' : err instanceof Error && err.message === 'Failed to fetch' ? 'Cannot reach the API. Start FastAPI on port 8000 and check the Railway URL if deployed.' : err instanceof Error ? err.message : 'Weather unavailable');
    } finally { setWeatherBusy(false); }
  }

  useEffect(() => { void loadWeather(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCountries() {
      setCountriesBusy(true);
      try {
        const response = await fetch(`${API_BASE}/api/weather/countries`, { signal: controller.signal });
        const data = await readJson(response, 'Country list request');
        if (!response.ok || !Array.isArray(data?.countries)) throw new Error(formatApiDetail(data?.detail) || 'Could not load countries.');
        setCountries(data.countries);
        const selected = data.countries.find((item) => item.name === country);
        if (selected) setCountryCode(selected.code);
      } catch (err) {
        if (err.name !== 'AbortError') setLocationListError(err instanceof Error ? err.message : 'Could not load countries.');
      } finally { setCountriesBusy(false); }
    }
    void loadCountries();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!country) return undefined;
    const controller = new AbortController();
    async function loadRegions() {
      setRegionsBusy(true); setLocationListError('');
      try {
        const response = await fetch(`${API_BASE}/api/weather/states?country=${encodeURIComponent(country)}`, { signal: controller.signal });
        const data = await readJson(response, 'State and region list request');
        if (!response.ok || !Array.isArray(data?.states)) throw new Error(formatApiDetail(data?.detail) || 'Could not load states or provinces.');
        setRegions(data.states);
        if (data.states.length === 0) {
          setRegion('');
          setCitiesBusy(true);
          const cityResponse = await fetch(`${API_BASE}/api/weather/cities?country=${encodeURIComponent(country)}`, { signal: controller.signal });
          const cityData = await readJson(cityResponse, 'City list request');
          if (!cityResponse.ok || !Array.isArray(cityData?.cities)) throw new Error(formatApiDetail(cityData?.detail) || 'Could not load cities.');
          setCities(cityData.cities);
        } else if (!data.states.includes(region)) setRegion('');
      } catch (err) {
        if (err.name !== 'AbortError') setLocationListError(err instanceof Error ? err.message : 'Could not load states or provinces.');
      } finally { setRegionsBusy(false); setCitiesBusy(false); }
    }
    void loadRegions();
    return () => controller.abort();
  }, [country]);

  useEffect(() => {
    if (!country || !region) return undefined;
    const controller = new AbortController();
    async function loadCities() {
      setCitiesBusy(true); setLocationListError(''); setCities([]);
      try {
        const params = new URLSearchParams({ country, state: region });
        const response = await fetch(`${API_BASE}/api/weather/cities?${params.toString()}`, { signal: controller.signal });
        const data = await readJson(response, 'City list request');
      if (!response.ok || !Array.isArray(data?.cities)) throw new Error(formatApiDetail(data?.detail) || 'Could not load cities for this region.');
        setCities(data.cities);
      } catch (err) {
        if (err.name !== 'AbortError') setLocationListError(err instanceof Error ? err.message : 'Could not load cities for this region.');
      } finally { setCitiesBusy(false); }
    }
    void loadCities();
    return () => controller.abort();
  }, [country, region]);

  function choosePhoto(candidate, imageSource = 'upload') {
    if (!candidate) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type)) { setError('Choose a JPG, PNG, or WebP image.'); return; }
    if (candidate.size > 10 * 1024 * 1024) { setError('Image must be under 10 MB.'); return; }
    setFile(candidate); setFileSource(imageSource); setResult(null); setError('');
    void analyze(candidate, imageSource);
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  }

  async function startCamera() {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access needs a secure page (HTTPS or localhost) and a supported browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
    } catch (cameraFailure) {
      const messages = {
        NotAllowedError: 'Camera permission was denied. Allow camera access in your browser settings, then try again.',
        NotFoundError: 'No camera was found on this device.',
        NotReadableError: 'The camera is busy in another app. Close it there and try again.',
      };
      setCameraError(messages[cameraFailure.name] || 'Could not open the camera. Check browser permissions and try again.');
    }
  }

  async function captureAndAnalyze() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setCameraError('Camera is still starting. Wait a moment, then capture again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Could not capture the camera image. Please try again.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!imageBlob) {
      setCameraError('Could not create an image from the camera. Please try again.');
      return;
    }
    const capturedPhoto = new File([imageBlob], `plant-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    stopCamera();
    setFile(capturedPhoto);
    setFileSource('camera');
    setResult(null);
    setError('');
    void analyze(capturedPhoto, 'camera');
  }

  async function analyze(candidate = file, imageSource = fileSource) {
    if (!candidate) return;
    if (!(candidate instanceof Blob)) {
      setError('The selected photo is not a file upload. Choose the image again, then retry.');
      return;
    }
    setBusy(true); setError('');
    try {
      const body = new FormData(); body.append('file', candidate, candidate.name || 'plant-photo.jpg');
      const response = await fetch(`${API_BASE}/api/predict`, { method: 'POST', headers: imageSource === 'camera' ? { 'X-Image-Source': 'camera' } : undefined, body });
      const data = await readJson(response, 'Plant scan request');
      if (!response.ok) throw new Error(formatApiDetail(data?.detail) || `Plant scan failed (HTTP ${response.status}).`);
      setResult(data);
      setVerifiedClass(data.predicted_class || '');
      setLabelMessage('');
      requestAnimationFrame(() => gsap.fromTo('.result-content', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Prediction unavailable'); }
    finally { setBusy(false); }
  }

  async function saveVerifiedLabel() {
    if (!result?.history_id || !verifiedClass || labelBusy) return;
    setLabelBusy(true);
    setLabelMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/predictions/${result.history_id}/label`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_name: verifiedClass }),
      });
      const data = await readJson(response, 'Save verified label');
      if (!response.ok) throw new Error(formatApiDetail(data?.detail) || `Save label failed (HTTP ${response.status}).`);
      setResult((current) => ({ ...current, expected_class: data.expected_class, is_correct: data.is_correct }));
      setLabelMessage(data.is_correct ? 'Verified: matches the model prediction.' : 'Correction saved for future model training.');
    } catch (saveError) {
      setLabelMessage(saveError instanceof Error ? saveError.message : 'Could not save the verified label.');
    } finally {
      setLabelBusy(false);
    }
  }

  function addWeatherComparison() {
    if (!weather?.location) return;
    const { latitude, longitude } = weather.location;
    const id = `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)}`;
    setWeatherComparisons((items) => [
      ...items.filter((item) => item.id !== id),
      { id, location: weather.location, current: weather.current, daily: weather.daily },
    ].slice(-8));
  }

  const cur = weather?.current;
  const daily = weather?.daily;
  const CurrentWeatherIcon = cur?.weather_code === 0 ? Sun : Number(cur?.weather_code) >= 51 ? CloudRain : CloudSun;
  const forecastRain = (daily?.precipitation_probability_max || []).map(Number).filter(Number.isFinite);
  const rainPeak = forecastRain.length ? Math.max(...forecastRain) : null;
  const rainToday = daily?.precipitation_probability_max?.[0];
  const todayHigh = daily?.temperature_2m_max?.[0];
  const todayLow = daily?.temperature_2m_min?.[0];
  const outlook = diseaseWeatherCue(result?.disease, result?.crop, cur || {}, daily || {});
  const confidence = Math.max(0, Math.min(1, Number(result?.confidence) || 0));
  const remedyTone = confidenceTone(confidence);
  const guidance = result ? getPlantGuidance(result.disease, result.crop) : null;
  const remedyPoints = carePlan?.remedy_points?.length ? carePlan.remedy_points : fallbackRemedyPoints(guidance?.actions || result?.advice || []);
  const worldwideCountries = countryWeatherFit?.countries || [];
  const worldwideFitCounts = {
    favorable_now: worldwideCountries.filter((item) => item.label === 'favorable_now').length,
    mixed: worldwideCountries.filter((item) => item.label === 'mixed').length,
    unfavorable: worldwideCountries.filter((item) => item.label === 'unfavorable').length,
    insufficient_data: worldwideCountries.filter((item) => item.label === 'insufficient_data').length,
  };
  const visibleWorldwideCountries = worldwideCountries.filter((item) =>
    (countryWeatherFitFilter === 'all' || item.label === countryWeatherFitFilter)
    && item.country.toLowerCase().includes(countryWeatherFitSearch.trim().toLowerCase()),
  );

  return <div className="shell" ref={root}>
    <aside className="sidebar"><a className="brand" href="#top"><span className="brand-icon"><Leaf size={19} /></span><span>fieldwise<span className="dot">.</span></span></a><p className="nav-caption">WORKSPACE</p><a className="nav active" href="#overview"><LayoutDashboard size={16} /> Overview</a><a className="nav" href="#plant"><ScanLine size={16} /> Plant detection</a><a className="nav" href="#weather"><CloudSun size={16} /> Weather & field</a><a className="nav" href="#worldwide-match"><Activity size={16} /> Crop insights</a><a className="nav" href="#about"><Info size={16} /> About Fieldwise</a><div className="side-help"><span className="help-icon"><Sprout size={17} /></span><b>Grow with confidence</b><small>AI powered plant health insights for your field.</small><a href="#plant">Start a scan <span>→</span></a></div><div className="side-foot"><span className="avatar">F</span><span><b>Field workspace</b><small>Plant health dashboard</small></span><span className="side-more">···</span></div></aside>
    <main id="top"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><i>/</i><b>Overview</b></div><div className="top-actions"><span className={`system-status ${apiStatus}`}><b className="live" /> {apiStatus === 'online' ? 'Backend connected' : apiStatus === 'limited' ? 'Model unavailable' : apiStatus === 'offline' ? 'Backend offline' : 'Connecting…'}</span><button type="button" className="mobile-access-button" onClick={onMobileAccess}><Smartphone size={14} /> Open on mobile</button><button type="button" className="icon-button" aria-label="Search dashboard" onClick={() => document.getElementById('plant')?.scrollIntoView({ behavior: 'smooth' })}><Search size={17} /></button><button type="button" className="icon-button notification" aria-label="View dashboard notices"><Bell size={17} /><i /></button><span className="top-avatar">F</span></div></header>
      <div className="page" id="overview">
        <div className="welcome"><div><div className="welcome-kicker"><span className="welcome-kicker-icon"><Sprout size={13} /></span> FIELD INTELLIGENCE <span className="kicker-separator">/</span> TODAY</div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, grower <span>✳</span></h1><p>Local weather and plant health, all in one place.</p></div><div className="welcome-actions"><button className="scan-quick-action" type="button" onClick={() => { if (file) { setFile(null); setFileSource('upload'); setResult(null); } else fileRef.current?.click(); }}><ScanLine size={15} /> {file ? 'Choose another photo' : 'Scan a plant'}</button><span className="date"><Sun size={15} /> {new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())}</span></div></div>

        <section className="metric-grid" aria-label="Field summary">
          <article className="metric-card"><div className="metric-top"><span>SCAN STATUS</span><span className="metric-icon teal"><ScanLine size={17} /></span></div><strong className="metric-detection">{result ? 'Complete' : 'Ready to scan'}</strong><small>{result ? 'Latest prediction saved' : 'Upload a leaf photo to begin'}</small><div className={`metric-footer ${result ? 'scan-complete' : ''}`}><span className="status-dot" /> {result ? 'Analysis finished' : 'AI model ready'}</div></article>
          <article className="metric-card"><div className="metric-top"><span>LAST DETECTION</span><span className="metric-icon violet"><Leaf size={17} /></span></div><strong className="metric-detection">{result ? prettify(result.crop) : 'Awaiting scan'}</strong><small>{result ? prettify(result.disease) : 'Upload a leaf photo to get started'}</small><div className="metric-footer"><span className="status-dot" /> {result?.is_healthy ? 'Healthy pattern' : result ? 'Review result' : 'AI model ready'}</div></article>
          <article className="metric-card"><div className="metric-top"><span>MODEL CONFIDENCE</span><span className="metric-icon blue"><Activity size={17} /></span></div><strong>{result ? `${Math.round(confidence * 100)}%` : '—'}</strong><small>{result ? 'Confidence in latest prediction' : 'Confidence appears after a scan'}</small><div className="metric-progress"><i style={{ width: result ? `${confidence * 100}%` : '0%' }} /></div></article>
          <article className="metric-card"><div className="metric-top"><span>LOCAL HUMIDITY</span><span className="metric-icon amber"><Droplets size={17} /></span></div><strong>{cur?.relative_humidity_2m != null ? `${cur.relative_humidity_2m}%` : '—'}</strong><small>{weather?.location?.name || 'Loading local weather'} <span>· {cur?.temperature_2m != null ? `${Math.round(cur.temperature_2m)}°C` : 'Current conditions'}</span></small><div className="humidity-track"><i style={{ width: `${Math.max(0, Math.min(100, Number(cur?.relative_humidity_2m) || 0))}%` }} /></div></article>
        </section>

        <section id="plant" className="dashboard-section plant"><div className="section-head"><div><span className="eyebrow">AI-POWERED SCREENING</span><h2>Check a plant</h2></div><span className="privacy"><ShieldCheck size={15} /> Your image is analyzed by the model</span></div><div className="plant-grid">
          <article className="card upload-card">{cameraOpen ? <div className="camera-live"><video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" /><div className="camera-controls"><button className="camera-capture" type="button" onClick={captureAndAnalyze} disabled={busy}><Camera size={17} /> Capture & scan</button><button className="camera-close" type="button" onClick={stopCamera} aria-label="Close camera"><X size={17} /></button></div>{cameraError && <div className="error" role="alert">{cameraError}</div>}</div> : !file ? <><input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { choosePhoto(e.target.files?.[0]); e.target.value = ''; }} /><input ref={captureFileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => { choosePhoto(e.target.files?.[0], 'camera'); e.target.value = ''; }} /><button className="drop" type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choosePhoto(e.dataTransfer.files?.[0]); }}><span className="upload-icon"><Upload /></span><b>Drop a leaf photo here</b><small>or click to browse · JPG, PNG, WebP · max 10 MB</small><span className="choose">Choose photo</span></button><button className="camera-launch" type="button" onClick={() => captureFileRef.current?.click()}><Camera size={16} /> Capture with phone camera</button><button className="camera-launch" type="button" onClick={startCamera}><Camera size={16} /> Use live camera</button>{cameraError && <div className="error" role="alert">{cameraError}</div>}</> : <div className="preview"><img src={preview} alt="Selected plant leaf" /><button className="remove" type="button" aria-label="Remove image" onClick={() => { setFile(null); setFileSource('upload'); setResult(null); }}>×</button><small>{file.name}</small></div>}
            {error && <div className="error" role="alert">{error}</div>}{!cameraOpen && <button className="analyze" disabled={!file || busy} onClick={() => analyze(file, fileSource)}>{busy ? 'Analyzing…' : 'Analyze plant'}</button>}
          </article>
          <article className="card result">{!result ? <div className="empty"><span className="empty-icon"><Leaf size={28} /></span><b>Your plant report appears here</b><p>Upload a clear photo of one leaf to see a screening prediction and care suggestions.</p><div>01 Upload photo　 ·　 02 Run analysis　 ·　 03 Review insights</div></div> : <div className="result-content"><div className="result-top"><span className="eyebrow">SCREENING RESULT</span><span className={result.is_healthy ? 'healthy' : 'attention'}>{result.is_healthy ? 'Looks healthy' : 'Review symptoms'}</span></div><h3>{prettify(result.disease)}</h3><p className="crop">{result.crop}</p>
            <div className={`remedy-panel ${result.is_healthy ? 'is-healthy' : ''} ${remedyTone}`}>
              <div className="remedy-heading"><div><span className="eyebrow">{carePlan ? 'CHATGPT CARE PLAN' : result.is_healthy ? 'PLANT CARE' : 'DISEASE CARE'}</span><h4>{guidance?.title || `Care plan for ${prettify(result.disease)}`}</h4></div><CircleGauge label="Model confidence" value={confidence * 100} tone={remedyTone} detail="Not treatment success" /></div>
              {weather && carePlan?.crop_weather_fit && <div className={`ai-weather-fit ${weatherFitTone(carePlan.crop_weather_fit.label)}`}><div className="ai-fit-heading"><span className="eyebrow">CHATGPT · {weather.location.name || 'SELECTED CITY'} · {weather.location.country || 'COUNTRY'} · NEXT FIVE DAYS</span><b>{weatherFitLabel(carePlan.crop_weather_fit.label)}</b></div><p>{carePlan.crop_weather_fit.summary}</p>{carePlan.disease_weather_context?.summary && <small><strong>{carePlan.disease_weather_context.label === 'weather_may_support_risk' ? 'Disease weather cue: ' : 'Disease context: '}</strong>{carePlan.disease_weather_context.summary}</small>}<small className="ai-fit-caveat">This is the selected city’s five-day forecast, not a full-season or country-wide suitability rating.</small></div>}
              <div className="remedy-steps">{remedyPoints.map((point, i) => <article className={`remedy-step step-${i % 3}`} key={`${i}-${point.action}`}><span className="remedy-number">{String(i + 1).padStart(2, '0')}</span><div className="remedy-step-body"><span className="remedy-point-label">Remedy</span><h5>{point.action}</h5><div><b>Why it helps</b><p>{point.explanation}</p></div><div className="remedy-solution"><b>Solution · how to do it</b><p>{point.solution}</p></div></div></article>)}</div>
              {carePlan?.caution && <p className="ai-care-caution">{carePlan.caution}</p>}
              {guidance?.source && <a className="guidance-source" href={guidance.source.href} target="_blank" rel="noreferrer">Read: {guidance.source.label}</a>}
            </div>
            {confidence < 0.7 && <p className="warn">Low confidence—try a clearer photo or seek local advice.</p>}
            <h4>Other possible matches</h4><div className="match-chart">{(result.top_predictions || []).slice(0, 3).map((match) => <div className="match" key={match.class_name}><span>{prettify(match.class_name)}</span><b>{percent(match.confidence)}</b><div className="match-track"><i style={{ width: `${Math.min(100, match.confidence * 100)}%` }} /></div></div>)}</div>
            <div className="label-review"><label htmlFor="verified-class">Confirm the correct label</label><p>Only save a label you have checked. Verified scans are included in the training-data export.</p><div><select id="verified-class" value={verifiedClass} onChange={(event) => { setVerifiedClass(event.target.value); setLabelMessage(''); }}><option value="">Select the correct class</option>{(result.classes || []).map((className) => <option key={className} value={className}>{prettify(className)}</option>)}</select><button type="button" onClick={saveVerifiedLabel} disabled={!verifiedClass || labelBusy}>{labelBusy ? 'Saving…' : result.expected_class ? 'Update label' : 'Save verified label'}</button></div>{labelMessage && <small role="status">{labelMessage}</small>}{result.expected_class && <small>Saved label: {prettify(result.expected_class)}</small>}<a href={`${API_BASE}/api/training-data/export.zip`}>Download verified images + manifest</a></div>
            {result.disclaimer && <small className="disclaimer">{result.disclaimer}</small>}
          </div>}</article>
        </div></section>

        <section id="weather" className="dashboard-section weather-section"><div className="section-head weather-section-head"><div><span className="eyebrow">LOCAL FORECAST</span><h2>Weather</h2><p className="weather-explainer">Current conditions and the five-day forecast for your selected city.</p></div><form className="weather-location-controls" onSubmit={loadWeather}>
          <label><span>Country</span><select value={country} disabled={countriesBusy || countries.length === 0} onChange={(e) => { const value = e.target.value; const selected = countries.find((item) => item.name === value); setCountry(value); setCountryCode(selected?.code || ''); setRegion(''); setCity(''); setRegions([]); setCities([]); }}><option value="">Select a country</option>{countries.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}</select></label>
          <label><span>State / region</span><select value={region} disabled={!country || regionsBusy || regions.length === 0} onChange={(e) => { setRegion(e.target.value); setCity(''); }}><option value="">{regionsBusy ? 'Loading regions…' : regions.length ? 'Select a state / region' : 'No regions listed'}</option>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>City</span><select value={city} disabled={!country || citiesBusy || cities.length === 0} onChange={(e) => setCity(e.target.value)}><option value="">{citiesBusy ? 'Loading cities…' : 'Select a city'}</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <button type="submit" disabled={weatherBusy || !city}>{weatherBusy ? 'Loading…' : 'Get weather'}</button>
        </form></div>{locationListError && <div className="error" role="alert">{locationListError}</div>}{weatherError && <div className="error" role="alert">{weatherError}</div>}
          <div className="weather-grid"><article className="current card"><div className="place"><MapPin size={14} />{weather ? [weather.location.name, weather.location.admin1, weather.location.country].filter(Boolean).join(', ') : city}</div><div className="current-main"><div><strong>{cur?.temperature_2m != null ? Math.round(cur.temperature_2m) : '—'}<sup>°C</sup></strong><span>{condition(cur?.weather_code)} · H {todayHigh != null ? `${Math.round(todayHigh)}°` : '—'} / L {todayLow != null ? `${Math.round(todayLow)}°` : '—'}</span></div><CurrentWeatherIcon size={56} style={{ color: Number(cur?.weather_code) >= 51 ? '#68a8db' : '#f3ad38' }} /></div><div className="metrics"><div><Droplets size={15} />Humidity<strong>{cur?.relative_humidity_2m ?? '—'}%</strong></div><div><CloudRain size={15} />Rain chance<strong>{rainToday ?? '—'}%</strong></div><div><Wind size={15} />Wind<strong>{cur?.wind_speed_10m ?? '—'} km/h</strong></div></div></article>
            <article className="card forecast"><div className="forecast-head"><div><span className="eyebrow">5-DAY FORECAST</span><h3>Upcoming weather</h3></div><span className="badge">{weather ? 'Updated' : 'Loading'}</span></div><ForecastDiagram daily={daily} /></article></div>
          <article className={`card weather-watch ${weatherValueTone(outlook.humidity, 70, 85)}`}><div className="watch-copy"><span className="eyebrow">WEATHER CUES · {weather?.location?.name || city || 'SELECTED CITY'}</span><h3>{outlook.title}</h3><p>{outlook.summary}</p><small>{result ? `Context for ${result.crop} · ${prettify(result.disease)}` : 'General field context · run a plant check for diagnosis-specific guidance'}</small></div><div className="weather-gauges"><CircleGauge label="Peak rain chance" value={rainPeak} tone={weatherValueTone(rainPeak, 35, 60)} detail="Next five days" /><CircleGauge label="Current humidity" value={cur?.relative_humidity_2m ?? null} tone={weatherValueTone(cur?.relative_humidity_2m, 70, 85)} detail="Selected city" /></div></article>
          <article id="worldwide-match" className="card worldwide-fit-panel" aria-live="polite"><div className="worldwide-fit-head"><div><span className="eyebrow">AI · WEATHER API · WORLDWIDE</span><h3>{result ? `Five-day weather match for ${result.crop}` : 'Worldwide crop weather match'}</h3><p>{result ? `AI compares the detected crop with forecast weather at a reference point in every available country.` : 'Analyze a plant to compare its crop with weather forecasts across countries.'}</p></div><button className="worldwide-retry" type="button" disabled={!result || countryWeatherFitBusy} onClick={() => setCountryWeatherFitReload((count) => count + 1)}>{countryWeatherFitBusy ? 'Comparing…' : countryWeatherFitError ? 'Retry comparison' : 'Refresh worldwide match'}</button></div>
            {!result && <div className="worldwide-fit-message">Upload and analyze a plant photo to get crop-specific country weather matches.</div>}
            {result && countryWeatherFitBusy && <div className="worldwide-fit-message" role="status">Getting five-day forecasts for country reference points and asking AI to compare them with {result.crop}. This may take a little while.</div>}
            {result && countryWeatherFitError && <div className="worldwide-fit-error" role="alert">{countryWeatherFitError}<small>{countryWeatherFitError.includes('OPENAI_API_KEY') ? 'Set OPENAI_API_KEY in backend/.env and restart FastAPI, then retry.' : 'Check that FastAPI can reach Open-Meteo, CountriesNow, and OpenAI, then retry.'}</small></div>}
            {countryWeatherFit && <><div className="worldwide-fit-summary"><div><b>{worldwideFitCounts.favorable_now}</b><span>Suitable now</span></div><div><b>{worldwideFitCounts.mixed}</b><span>Partly suitable</span></div><div><b>{worldwideFitCounts.unfavorable}</b><span>Not suitable now</span></div><div><b>{worldwideFitCounts.insufficient_data}</b><span>Not assessed</span></div></div><div className="worldwide-fit-controls"><div className="worldwide-fit-filters" role="group" aria-label="Filter countries by weather fit">{[['favorable_now', 'Suitable'], ['mixed', 'Partly suitable'], ['unfavorable', 'Not suitable'], ['insufficient_data', 'Not assessed'], ['all', 'All countries']].map(([value, label]) => <button className={countryWeatherFitFilter === value ? 'selected' : ''} type="button" key={value} aria-pressed={countryWeatherFitFilter === value} onClick={() => setCountryWeatherFitFilter(value)}>{label}{value !== 'all' && <span>{worldwideFitCounts[value]}</span>}</button>)}</div><input type="search" aria-label="Search country weather matches" placeholder="Search countries" value={countryWeatherFitSearch} onChange={(event) => setCountryWeatherFitSearch(event.target.value)} /></div>
              {visibleWorldwideCountries.length ? <div className="worldwide-country-grid">{visibleWorldwideCountries.map((item) => { const metrics = item.weather || {}; const temperature = metrics.five_day_lowest_min_c == null || metrics.five_day_highest_max_c == null ? '—' : `${metrics.five_day_lowest_min_c}–${metrics.five_day_highest_max_c}°C`; return <article className={`worldwide-country-card ${weatherFitTone(item.label)}`} key={item.country_code}><div className="worldwide-country-heading"><b>{item.country}</b><span>{weatherFitLabel(item.label)}</span></div><div className="worldwide-country-metrics"><span>Now <b>{metrics.current_temperature_c == null ? '—' : `${metrics.current_temperature_c}°C`}</b></span><span>5-day range <b>{temperature}</b></span><span>Humidity <b>{metrics.current_humidity_pct == null ? '—' : `${metrics.current_humidity_pct}%`}</b></span><span>Rain total <b>{metrics.five_day_rain_total_mm == null ? '—' : `${metrics.five_day_rain_total_mm} mm`}</b></span><span>Peak rain chance <b>{metrics.five_day_peak_rain_chance_pct == null ? '—' : `${metrics.five_day_peak_rain_chance_pct}%`}</b></span></div><p>{item.summary}</p></article>; })}</div> : <div className="worldwide-fit-message">No countries match this filter. Choose “All countries” to see every assessment.</div>}
              <small className="worldwide-fit-note">{countryWeatherFit.evaluated_count} countries checked · Open-Meteo five-day forecast · one reference coordinate per country. Conditions can differ widely within a country and across seasons; this is a short-term weather indication, not a planting guarantee.</small></>}
          </article>
          <article className="card country-compare"><div className="compare-heading"><div><span className="eyebrow">COMPARE COUNTRIES & CITIES</span><h3>{result ? `Weather for ${result.crop}` : 'Compare local weather'}</h3><p>{result ? `Compare humidity and five-day rain for ${prettify(result.disease)} in different cities.` : 'Run a plant check to connect the comparison to the detected crop and disease.'}</p></div><button className="compare-add" type="button" disabled={!weather} onClick={addWeatherComparison}>＋ Add current city</button></div>
            {weatherComparisons.length ? <div className="comparison-grid">{weatherComparisons.map((item) => {
              const rainTotal = (item.daily?.precipitation_sum || []).map(Number).filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
              const itemRain = (item.daily?.precipitation_probability_max || []).map(Number).filter(Number.isFinite);
              const itemPeakRain = itemRain.length ? Math.max(...itemRain) : null;
              const cue = diseaseWeatherCue(result?.disease, result?.crop, item.current || {}, item.daily || {});
              const itemLabel = [item.location.name, item.location.admin1, item.location.country].filter(Boolean).join(', ');
              const aiCityFit = carePlan?.city_comparisons?.find((entry) => entry.location.toLowerCase() === itemLabel.toLowerCase());
              return <article className="comparison-place" key={item.id}><div className="comparison-place-head"><div><b><MapPin size={13} /> {itemLabel}</b><small>{item.location.country || 'Selected location'}</small></div><button type="button" aria-label={`Remove ${item.location.name} from comparison`} onClick={() => setWeatherComparisons((items) => items.filter((entry) => entry.id !== item.id))}>×</button></div><div className="comparison-metrics"><CircleGauge label="Humidity" value={item.current?.relative_humidity_2m ?? null} tone={weatherValueTone(item.current?.relative_humidity_2m, 70, 85)} detail="Current" /><CircleGauge label="Rain chance" value={itemPeakRain} tone={weatherValueTone(itemPeakRain, 35, 60)} detail="Peak · 5 days" /></div><div className="comparison-rain-total"><CloudRain size={14} /><span>Forecast rain total</span><b>{rainTotal.toFixed(1)} mm / 5 days</b></div>{aiCityFit && <div className={`ai-city-fit ${weatherFitTone(aiCityFit.label)}`}><b>{item.location.country || 'Country'} · selected city fit · {weatherFitLabel(aiCityFit.label)}</b><small>{aiCityFit.summary}</small></div>}<div className="comparison-cue"><b>{result ? cue.title : 'Scan a plant for disease weather guidance'}</b><small>{result ? cue.summary : 'The saved city weather values are shown above.'}</small></div></article>;
            })}</div> : <div className="comparison-empty">Get weather for a city, then choose <b>＋ Add current city</b>. Repeat for other countries to compare their selected cities.</div>}
            <small className="comparison-note">These are city-level five-day snapshots. They do not show a country’s full growing-season climate or guarantee crop suitability; soil, season, cultivar, and irrigation also matter.</small>
          </article>
          <p className="weather-caveat">Ring colors show lower (green), moderate (amber), and higher readings for the displayed humidity or rain chance. Disease responses differ: some depend on leaf wetness, while virus and pest risks need other checks. Use the disease-specific care steps and compare cities here.</p>
          {weather?.farm_notes && <div className="field-notes"><div><span className="leaf-tile"><Leaf size={17} /></span><b>Field notes</b><small>Weather-based planning cues</small></div><ul>{weather.farm_notes.map((note) => <li key={note}>{note}</li>)}</ul><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo</a></div>}
        </section>
        <footer>FIELDWISE · LOCATION LISTS BY COUNTRIESNOW · WEATHER BY OPEN-METEO · AI SCREENING IS INFORMATIONAL</footer>
      </div>
    </main>
  </div>;
}

export default function App() {
  const [page, setPage] = useState(() => {
    if (window.location.hash === '#about') return 'about';
    return window.location.hash && window.location.hash !== '#home' ? 'dashboard' : 'home';
  });
  const [mobileAccessOpen, setMobileAccessOpen] = useState(false);

  useEffect(() => {
    const syncPage = () => {
      if (window.location.hash === '#about') setPage('about');
      else if (window.location.hash && window.location.hash !== '#home') setPage('dashboard');
      else setPage('home');
    };
    window.addEventListener('hashchange', syncPage);
    return () => window.removeEventListener('hashchange', syncPage);
  }, []);

  function goToDashboard(section = 'overview') {
    setPage('dashboard');
    window.history.replaceState(null, '', `#${section}`);
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' })));
  }

  function openMobileAccess() {
    if (window.matchMedia('(max-width: 760px)').matches) {
      window.location.hash = '#plant';
      return;
    }
    setMobileAccessOpen(true);
  }

  const currentPage = page === 'about'
    ? <AboutPage onNavigate={goToDashboard} onMobileAccess={openMobileAccess} />
    : page === 'dashboard'
      ? <Dashboard onMobileAccess={openMobileAccess} />
      : <HomePage onDashboard={goToDashboard} onMobileAccess={openMobileAccess} />;

  return <>{currentPage}<MobileAccessModal open={mobileAccessOpen} onClose={() => setMobileAccessOpen(false)} /></>;
}
