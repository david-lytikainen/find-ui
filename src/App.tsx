import { useState } from "react";
import { DuplicateReport, Location, WaterReport, waterApi } from "./api";

type Screen = "home" | "categories" | "locating" | "results" | "report" | "duplicate" | "done";
type Mode = "find" | "report";

function getSessionVotes(): Record<number, number> {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem("find-session-votes") || "{}");
    return Object.fromEntries(Object.entries(saved).filter(([, vote]) => vote === -1 || vote === 1)) as Record<number, number>;
  } catch { return {}; }
}

function scoreClass(score: number): string {
  if (score < -1) return "bg-danger";
  if (score <= 2) return "bg-warning text-dark";
  return "bg-success";
}

function coordinates(report: Pick<WaterReport, "latitude" | "longitude">): string {
  return `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("find");
  const [location, setLocation] = useState<Location | null>(null);
  const [reports, setReports] = useState<WaterReport[]>([]);
  const [description, setDescription] = useState("");
  const [duplicate, setDuplicate] = useState<DuplicateReport | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingVote, setPendingVote] = useState<number | null>(null);
  const [sessionVotes, setSessionVotes] = useState<Record<number, number>>(getSessionVotes);

  const goHome = () => { setScreen("home"); setError(""); setMessage(""); setDescription(""); setDuplicate(null); };
  const goCategories = () => { setScreen("categories"); setError(""); setMessage(""); };

  const beginWater = (nextMode: Mode) => {
    setMode(nextMode);
    setError("");
    setMessage("");
    setScreen("locating");
    if (!navigator.geolocation) { setError("This browser cannot share its location. Try a browser that supports location access."); return; }
    navigator.geolocation.getCurrentPosition(async (position) => {
      const currentLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setLocation(currentLocation);
      if (nextMode === "find") {
        setBusy(true);
        try { const result = await waterApi.reports(currentLocation); setReports(result.reports.map(report => ({ ...report, my_vote: sessionVotes[report.id] || 0 }))); setScreen("results"); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not load water locations."); }
        finally { setBusy(false); }
      } else {
        setDescription("");
        setScreen("report");
      }
    }, () => setError("Please allow location access to continue. After allowing it in your browser, tap Try again."), { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  };

  const submitReport = async (forceDuplicate = false) => {
    if (!location || !description.trim()) return;
    setError("");
    setBusy(true);
    try {
      const result = await waterApi.create(description.trim(), location, forceDuplicate);
      if (!result.created && result.duplicate) { setDuplicate(result.duplicate); setScreen("duplicate"); return; }
      setMessage("Thanks for sharing this water location.");
      setScreen("done");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save this location."); }
    finally { setBusy(false); }
  };

  const vote = async (reportId: number, direction: -1 | 1, currentVote: number) => {
    setPendingVote(reportId);
    setError("");
    try {
      const nextVote = currentVote === direction ? 0 : direction;
      const result = await waterApi.vote(reportId, nextVote - currentVote);
      const nextVotes = { ...sessionVotes, [reportId]: nextVote };
      if (!nextVote) delete nextVotes[reportId];
      window.sessionStorage.setItem("find-session-votes", JSON.stringify(nextVotes));
      setSessionVotes(nextVotes);
      setReports(current => current.map(report => report.id === reportId ? { ...report, credibility: result.credibility, my_vote: nextVote } : report));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save your vote."); }
    finally { setPendingVote(null); }
  };

  const confirmSameReport = async () => {
    if (!duplicate) return;
    setBusy(true);
    setError("");
    try {
      const currentVote = sessionVotes[duplicate.id] || 0;
      const result = await waterApi.vote(duplicate.id, 1 - currentVote);
      const nextVotes = { ...sessionVotes, [duplicate.id]: 1 };
      window.sessionStorage.setItem("find-session-votes", JSON.stringify(nextVotes));
      setSessionVotes(nextVotes);
      setReports(current => current.map(report => report.id === duplicate.id ? { ...report, credibility: result.credibility, my_vote: 1 } : report));
      setMessage("Thanks for confirming this location.");
      setScreen("done");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not confirm this location."); }
    finally { setBusy(false); }
  };

  const card = (report: WaterReport) => <article className="card shadow-sm mb-3" key={report.id}>
    <div className="card-body">
      <div className="d-flex align-items-start justify-content-between gap-3">
        <div className="min-w-0"><h2 className="h5 mb-1 text-break">{report.description}</h2><div className="small text-secondary">{Math.round(report.distance_meters * 3.28084)} ft away · {coordinates(report)}</div></div>
        <span className={`badge rounded-pill fs-6 ${scoreClass(report.credibility)}`} aria-label={`Credibility ${report.credibility}`}>{report.credibility}</span>
      </div>
      <div className="d-flex align-items-center justify-content-between gap-2 mt-3">
        <div className="btn-group" role="group" aria-label={`Vote on ${report.description}`}>
          <button className={`btn ${report.my_vote === 1 ? "btn-success" : "btn-outline-secondary"}`} disabled={pendingVote === report.id} onClick={() => void vote(report.id, 1, report.my_vote)} aria-label="Upvote"><i className="fa-solid fa-arrow-up" /></button>
          <button className={`btn ${report.my_vote === -1 ? "btn-danger" : "btn-outline-secondary"}`} disabled={pendingVote === report.id} onClick={() => void vote(report.id, -1, report.my_vote)} aria-label="Downvote"><i className="fa-solid fa-arrow-down" /></button>
        </div>
        <a className="btn btn-primary" href={`https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`} target="_blank" rel="noreferrer"><i className="fa-solid fa-diamond-turn-right me-2" />Directions</a>
      </div>
    </div>
  </article>;

  return <main className="container min-vh-100 py-4 py-md-5">
    <div className="find-shell mx-auto">
      <header className="text-center mb-4"><div className="display-6 fw-bold text-primary"><i className="fa-solid fa-location-dot me-2" />FIND</div><p className="text-secondary mb-0">Community-shared water nearby</p></header>
      {screen !== "home" && <button className="btn btn-link px-0 mb-3" onClick={screen === "results" || screen === "report" || screen === "locating" ? goCategories : screen === "duplicate" ? () => setScreen("report") : goHome}><i className="fa-solid fa-arrow-left me-2" />Back</button>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {screen === "home" && <section className="card shadow-sm"><div className="card-body p-4 text-center"><h1 className="h4 mb-3">Find water. Share water.</h1><p className="text-secondary">Help people nearby discover places to refill.</p><div className="d-grid gap-3 mt-4"><button className="btn btn-primary btn-lg" onClick={() => { setMode("find"); setScreen("categories"); }}>Find</button><button className="btn btn-outline-primary btn-lg" onClick={() => { setMode("report"); setScreen("categories"); }}>I Found</button></div></div></section>}
      {screen === "categories" && <section className="card shadow-sm"><div className="card-body p-4"><h1 className="h4">{mode === "find" ? "What are you looking for?" : "What did you find?"}</h1><p className="text-secondary">For now, FIND is focused on water.</p><button className="btn btn-primary btn-lg w-100 mt-2" onClick={() => beginWater(mode)}><i className="fa-solid fa-droplet me-2" />Water</button></div></section>}
      {screen === "locating" && <section className="card shadow-sm"><div className="card-body p-4 text-center"><div className="spinner-border text-primary mb-3" role="status"><span className="visually-hidden">Waiting for location</span></div><h1 className="h4">Please allow location access</h1><p className="text-secondary mb-0">{mode === "find" ? "We need your location to find nearby water." : "We need your location to add this water spot for others."}</p>{error && <button className="btn btn-outline-primary mt-3" onClick={() => beginWater(mode)}>Try again</button>}</div></section>}
      {screen === "results" && <section><h1 className="h4 mb-3">Water near you</h1>{busy && <div className="text-center py-4"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading locations</span></div></div>}{!busy && reports.length === 0 && <div className="alert alert-info">No water spots have been shared nearby yet. If you find one, add it for others.</div>}{reports.map(card)}</section>}
      {screen === "report" && <section className="card shadow-sm"><div className="card-body p-4"><h1 className="h4">I Found Water</h1><p className="text-secondary">Add a short description so people can recognize the spot.</p><label className="form-label" htmlFor="water-description">Describe briefly</label><input id="water-description" className="form-control form-control-lg" maxLength={30} placeholder="Park, Bottle filler 1st floor, etc" value={description} onChange={event => setDescription(event.target.value)} /><div className="form-text text-end">{description.length}/30</div><button className="btn btn-primary btn-lg w-100 mt-3" disabled={!description.trim() || busy} onClick={() => void submitReport()}>{busy ? "Checking nearby spots…" : "I Found Water"}</button></div></section>}
      {screen === "duplicate" && duplicate && <section className="card shadow-sm"><div className="card-body p-4"><h1 className="h4">Is this the same?</h1><p className="text-secondary">We found a water spot within about 30 feet.</p><div className="border rounded p-3 mb-3"><div className="fw-semibold">{duplicate.description}</div><div className="small text-secondary">{Math.round(duplicate.distance_meters * 3.28084)} ft away · {coordinates(duplicate)}</div></div><div className="d-grid gap-2"><button className="btn btn-success btn-lg" disabled={busy} onClick={() => void confirmSameReport()}><i className="fa-solid fa-check me-2" />Yes, this is the same</button><button className="btn btn-outline-secondary btn-lg" disabled={busy} onClick={() => void submitReport(true)}><i className="fa-solid fa-xmark me-2" />No, add a new spot</button></div></div></section>}
      {screen === "done" && <section className="card shadow-sm"><div className="card-body p-4 text-center"><div className="text-success fs-1"><i className="fa-solid fa-circle-check" /></div><h1 className="h4 mt-2">Done</h1><p className="text-secondary">{message}</p><button className="btn btn-primary w-100" onClick={goHome}>Back to FIND</button></div></section>}
    </div>
  </main>;
}
