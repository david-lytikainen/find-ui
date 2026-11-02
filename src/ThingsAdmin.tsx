import { FormEvent, useCallback, useEffect, useState } from "react";
import { Thing, waterApi } from "./api";

export default function ThingsAdmin({ token }: { token: string }) {
  const [things, setThings] = useState<Thing[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await waterApi.adminThings(token);
      setThings(result.things);
      setNames(Object.fromEntries(result.things.map(thing => [thing.id, thing.name])));
      setError("");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not load things."); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const addThing = async (event: FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try { await waterApi.createThing(newName.trim(), token); setNewName(""); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not add thing."); }
    finally { setBusy(false); }
  };

  const saveThing = async (thing: Thing, archived = thing.archived) => {
    const name = (names[thing.id] || "").trim();
    if (!name) return;
    setBusy(true);
    try { await waterApi.updateThing({ ...thing, name, archived }, token); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not update thing."); }
    finally { setBusy(false); }
  };

  return <section className="card mt-4"><div className="card-body"><h2 className="h5">Findable things</h2><p className="small text-secondary">Active things appear under both Find and I Found, ordered by Find clicks.</p>{error && <div className="alert alert-danger py-2" role="alert">{error}</div>}<form className="input-group mb-3" onSubmit={addThing}><input className="form-control" maxLength={50} aria-label="New thing name" placeholder="Add a thing" value={newName} onChange={event => setNewName(event.target.value)} /><button className="btn btn-primary" disabled={busy || !newName.trim()}>Add</button></form><div className="list-group">{things.map(thing => <div className="list-group-item" key={thing.id}><div className="d-flex flex-column flex-sm-row gap-2 align-items-sm-center"><input className="form-control" maxLength={50} aria-label={`Name for ${thing.name}`} value={names[thing.id] ?? thing.name} onChange={event => setNames(current => ({ ...current, [thing.id]: event.target.value }))} /><span className="small text-secondary text-nowrap">{thing.clicks} finds</span><button className="btn btn-outline-primary" disabled={busy || !(names[thing.id] || "").trim()} onClick={() => void saveThing(thing)}>Save</button><button className={`btn ${thing.archived ? "btn-outline-success" : "btn-outline-secondary"}`} disabled={busy} onClick={() => void saveThing(thing, !thing.archived)}>{thing.archived ? "Restore" : "Archive"}</button></div></div>)}</div></div></section>;
}
