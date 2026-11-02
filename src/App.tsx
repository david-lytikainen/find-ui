import { FormEvent, useEffect, useState } from "react";
import { DuplicateThingLocation, Location, Thing, ThingLocation, waterApi } from "./api";
import CommentThread from "./CommentThread";
import ThingsAdmin from "./ThingsAdmin";

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

function coordinates(report: Pick<ThingLocation, "latitude" | "longitude">): string {
  return `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("find");
  const [location, setLocation] = useState<Location | null>(null);
  const [reports, setReports] = useState<ThingLocation[]>([]);
  const [things, setThings] = useState<Thing[]>([]);
  const [selectedThing, setSelectedThing] = useState<Thing | null>(null);
  const [thingsLoading, setThingsLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [duplicate, setDuplicate] = useState<DuplicateThingLocation | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingVote, setPendingVote] = useState<number | null>(null);
  const [sessionVotes, setSessionVotes] = useState<Record<number, number>>(getSessionVotes);
  const [commentReportId, setCommentReportId] = useState<number | null | undefined>(undefined);
  const [adminToken, setAdminToken] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoading, setAdminLoading] = useState(Boolean(window.localStorage.getItem("find-admin-token")));
  const isAdminRoute = window.location.pathname.replace(/\/$/, "") === "/admin";

  useEffect(() => {
    const token = window.localStorage.getItem("find-admin-token");
    if (!token) return;
    void waterApi.me(token).then(user => { setAdminToken(token); setAdminName(user.name); }).catch(() => { window.localStorage.removeItem("find-admin-token"); setAdminToken(""); }).finally(() => setAdminLoading(false));
  }, []);

  const goHome = () => { setScreen("home"); setError(""); setMessage(""); setDescription(""); setDuplicate(null); setSelectedThing(null); };
  const goCategories = () => { setScreen("categories"); setError(""); setMessage(""); };

  const openCategories = (nextMode: Mode) => {
    setMode(nextMode);
    setScreen("categories");
    setError("");
    setThingsLoading(true);
    void waterApi.things().then(result => setThings(result.things)).catch(requestError => setError(requestError instanceof Error ? requestError.message : "Could not load things.")).finally(() => setThingsLoading(false));
  };

  const beginWater = (nextMode: Mode, thing: Thing) => {
    setSelectedThing(thing);
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
        try { const result = await waterApi.reports(thing.id, currentLocation); setReports(result.reports.map(report => ({ ...report, my_vote: sessionVotes[report.id] || 0 }))); setScreen("results"); }
        catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not load nearby locations."); }
        finally { setBusy(false); }
      } else {
        setDescription("");
        setScreen("report");
      }
    }, () => setError("Please allow location access to continue. After allowing it in your browser, tap Try again."), { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  };

  const chooseThing = (thing: Thing) => {
    if (mode === "find") {
      void waterApi.clickThing(thing.id).then(result => setThings(current => current.map(item => item.id === thing.id ? { ...item, clicks: result.clicks } : item).sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name)))).catch(requestError => setError(requestError instanceof Error ? requestError.message : "Could not count this selection."));
    }
    beginWater(mode, thing);
  };

  const submitReport = async (forceDuplicate = false) => {
    if (!location || !selectedThing || !description.trim()) return;
    setError("");
    setBusy(true);
    try {
      const result = await waterApi.create(selectedThing.id, description.trim(), location, forceDuplicate);
      if (!result.created && result.duplicate) { setDuplicate(result.duplicate); setScreen("duplicate"); return; }
      setMessage(`Thanks for sharing this ${selectedThing.name.toLowerCase()} location.`);
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
      setReports(current => current.map(report => report.id === reportId ? { ...report, votes: result.votes, my_vote: nextVote } : report));
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
      setReports(current => current.map(report => report.id === duplicate.id ? { ...report, votes: result.votes, my_vote: 1 } : report));
      setMessage("Thanks for confirming this location.");
      setScreen("done");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not confirm this location."); }
    finally { setBusy(false); }
  };

  const loginAdmin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await waterApi.login(adminEmail, adminPassword);
      setAdminToken(result.token);
      setAdminName(result.user.name);
      window.localStorage.setItem("find-admin-token", result.token);
      setAdminPassword("");
      setError("");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not sign in."); }
  };

  const card = (report: ThingLocation) => <article className="card shadow-sm mb-3" key={report.id}>
    <div className="card-body">
      <div className="d-flex align-items-start justify-content-between gap-3">
        <div className="min-w-0"><h2 className="h5 mb-1 text-break">{report.description}</h2><div className="small text-secondary">{Math.round(report.distance_meters * 3.28084)} ft away · {coordinates(report)}</div></div>
        <span className={`badge rounded-pill fs-6 ${scoreClass(report.votes)}`} aria-label={`Votes ${report.votes}`}>{report.votes}</span>
      </div>
      <div className="d-flex align-items-center justify-content-between gap-2 mt-3">
        <div className="btn-group" role="group" aria-label={`Vote on ${report.description}`}>
          <button className={`btn ${report.my_vote === 1 ? "btn-success" : "btn-outline-secondary"}`} disabled={pendingVote === report.id} onClick={() => void vote(report.id, 1, report.my_vote)} aria-label="Upvote"><i className="fa-solid fa-arrow-up" /></button>
          <button className={`btn ${report.my_vote === -1 ? "btn-danger" : "btn-outline-secondary"}`} disabled={pendingVote === report.id} onClick={() => void vote(report.id, -1, report.my_vote)} aria-label="Downvote"><i className="fa-solid fa-arrow-down" /></button>
        </div>
        <div className="d-flex gap-2"><button className="btn btn-outline-primary" onClick={() => setCommentReportId(report.id)}><i className="fa-regular fa-comment me-2" />Comments</button><a className="btn btn-primary" href={`https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`} target="_blank" rel="noreferrer"><i className="fa-solid fa-diamond-turn-right me-2" />Directions</a></div>
      </div>
    </div>
  </article>;

  return <main className={`container min-vh-100 py-4 py-md-5 ${screen === "home" && !isAdminRoute ? "find-home" : ""}`}>
    <div className="find-shell mx-auto">
      <header className="text-center mb-4"><div className="display-6 fw-bold text-primary"><i className="fa-solid fa-location-dot me-2" />FIND</div><p className="text-secondary mb-0">Community-shared things nearby</p></header>
      {isAdminRoute ? <section className="card shadow-sm"><div className="card-body p-4"><h1 className="h4">FIND Admin</h1>{error && <div className="alert alert-danger" role="alert">{error}</div>}{adminLoading ? <div className="text-center py-3"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Checking admin session</span></div></div> : adminToken ? <><p className="text-secondary">Signed in{adminName ? ` as ${adminName}` : ""}. You can manage findable things and delete comments.</p><a className="btn btn-primary w-100 mb-3" href="/">Open FIND</a><button className="btn btn-outline-danger w-100" onClick={() => { setAdminToken(""); setAdminName(""); window.localStorage.removeItem("find-admin-token"); }}>Sign out</button><ThingsAdmin token={adminToken} /><div className="card mt-4"><div className="card-header bg-white fw-semibold">Homepage comments</div><CommentThread reportId={null} adminToken={adminToken} embedded /></div></> : <form onSubmit={loginAdmin}><p className="text-secondary">Sign in to manage things and remove comments.</p><label className="form-label" htmlFor="admin-email">Email</label><input id="admin-email" className="form-control mb-3" type="email" autoComplete="username" value={adminEmail} onChange={event => setAdminEmail(event.target.value)} required /><label className="form-label" htmlFor="admin-password">Password</label><input id="admin-password" className="form-control mb-3" type="password" autoComplete="current-password" value={adminPassword} onChange={event => setAdminPassword(event.target.value)} required /><button className="btn btn-primary w-100" type="submit">Sign in</button></form>}</div></section> : <>
      {screen !== "home" && <button className="btn btn-link px-0 mb-3" onClick={screen === "results" || screen === "report" || screen === "locating" ? goCategories : screen === "duplicate" ? () => setScreen("report") : goHome}><i className="fa-solid fa-arrow-left me-2" />Back</button>}
      {!isAdminRoute && error && <div className="alert alert-danger" role="alert">{error}</div>}
      {screen === "home" && <section className="home-panel"><div className="card shadow-sm"><div className="card-body p-4 text-center"><h1 className="h4 mb-3">Find and share nearby things.</h1><p className="text-secondary">Help people nearby discover places and useful things.</p><div className="d-grid gap-3 mt-4"><button className="btn btn-primary btn-lg" onClick={() => openCategories("find")}>Find</button><button className="btn btn-outline-primary btn-lg" onClick={() => openCategories("report")}>I Found</button></div></div></div><div className="card shadow-sm home-comments"><div className="card-header bg-white fw-semibold">Community comments</div><CommentThread reportId={null} adminToken={adminToken} embedded /></div></section>}
      {screen === "categories" && <section className="card shadow-sm"><div className="card-body p-4"><h1 className="h4">{mode === "find" ? "What are you looking for?" : "What did you find?"}</h1><p className="text-secondary">Choose a thing from the community list.</p>{thingsLoading && <div className="text-center py-3"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading things</span></div></div>}{!thingsLoading && !things.length && <div className="alert alert-info">No things are available yet.</div>}<div className="d-grid gap-2">{things.map(thing => <button key={thing.id} className="btn btn-primary btn-lg text-start" disabled={busy} onClick={() => void chooseThing(thing)}>{thing.name}</button>)}</div></div></section>}
      {screen === "locating" && <section className="card shadow-sm"><div className="card-body p-4 text-center"><div className="spinner-border text-primary mb-3" role="status"><span className="visually-hidden">Waiting for location</span></div><h1 className="h4">Please allow location access</h1><p className="text-secondary mb-0">{mode === "find" ? `We need your location to find nearby ${selectedThing?.name.toLowerCase()}.` : `We need your location to add this ${selectedThing?.name.toLowerCase()} location for others.`}</p>{error && selectedThing && <button className="btn btn-outline-primary mt-3" onClick={() => beginWater(mode, selectedThing)}>Try again</button>}</div></section>}
      {screen === "results" && <section><h1 className="h4 mb-3">{selectedThing?.name} near you</h1>{busy && <div className="text-center py-4"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading locations</span></div></div>}{!busy && reports.length === 0 && <div className="alert alert-info">No {selectedThing?.name.toLowerCase()} locations have been shared nearby yet. If you find one, add it for others.</div>}{reports.map(card)}</section>}
      {screen === "report" && <section className="card shadow-sm"><div className="card-body p-4"><h1 className="h4">I Found {selectedThing?.name}</h1><p className="text-secondary">Add a short description so people can recognize the spot.</p><label className="form-label" htmlFor="thing-description">Describe briefly</label><input id="thing-description" className="form-control form-control-lg" maxLength={30} placeholder="Near the park entrance, west side, etc" value={description} onChange={event => setDescription(event.target.value)} /><div className="form-text text-end">{description.length}/30</div><button className="btn btn-primary btn-lg w-100 mt-3" disabled={!description.trim() || busy} onClick={() => void submitReport()}>{busy ? "Checking nearby locations…" : `I Found ${selectedThing?.name}`}</button></div></section>}
      {screen === "duplicate" && duplicate && <section className="card shadow-sm"><div className="card-body p-4"><h1 className="h4">Is this the same?</h1><p className="text-secondary">We found a {selectedThing?.name.toLowerCase()} location within about 30 feet.</p><div className="border rounded p-3 mb-3"><div className="fw-semibold">{duplicate.description}</div><div className="small text-secondary">{Math.round(duplicate.distance_meters * 3.28084)} ft away · {coordinates(duplicate)}</div></div><div className="d-grid gap-2"><button className="btn btn-success btn-lg" disabled={busy} onClick={() => void confirmSameReport()}><i className="fa-solid fa-check me-2" />Yes, this is the same</button><button className="btn btn-outline-secondary btn-lg" disabled={busy} onClick={() => void submitReport(true)}><i className="fa-solid fa-xmark me-2" />No, add a new spot</button></div></div></section>}
      {screen === "done" && <section className="card shadow-sm"><div className="card-body p-4 text-center"><div className="text-success fs-1"><i className="fa-solid fa-circle-check" /></div><h1 className="h4 mt-2">Done</h1><p className="text-secondary">{message}</p><button className="btn btn-primary w-100" onClick={goHome}>Back to FIND</button></div></section>}
      {commentReportId !== undefined && <div className="comment-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCommentReportId(undefined); }}><div className="comment-modal card shadow-lg" role="dialog" aria-modal="true" aria-label="Report comments"><CommentThread reportId={commentReportId} adminToken={adminToken} onClose={() => setCommentReportId(undefined)} /></div></div>}
      </>}
    </div>
  </main>;
}
