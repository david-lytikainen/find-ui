import { FormEvent, useCallback, useEffect, useState } from "react";
import { Comment, waterApi } from "./api";

type Props = { reportId: number | null; adminToken: string; embedded?: boolean; onClose?: () => void };

function getVotes(): Record<number, number> {
  try { return JSON.parse(window.sessionStorage.getItem("find-comment-votes") || "{}"); } catch { return {}; }
}

export default function CommentThread({ reportId, adminToken, embedded = false, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [body, setBody] = useState("");
  const [votes, setVotes] = useState<Record<number, number>>(getVotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage: number) => {
    try {
      const result = await waterApi.comments(reportId, nextPage);
      const storedVotes = getVotes();
      setComments(result.comments.map(comment => ({ ...comment, my_vote: storedVotes[comment.id] || 0 })));
      setPages(result.pages);
      setTotal(result.total);
      setPage(nextPage);
      setError("");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not load comments."); }
  }, [reportId]);

  useEffect(() => { void load(1); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try { await waterApi.addComment(reportId, body.trim()); setBody(""); await load(1); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not post comment."); }
    finally { setBusy(false); }
  };

  const vote = async (comment: Comment, direction: -1 | 1) => {
    const nextVote = comment.my_vote === direction ? 0 : direction;
    setBusy(true);
    try {
      await waterApi.voteComment(comment.id, nextVote - comment.my_vote);
      const next = { ...votes, [comment.id]: nextVote };
      if (!nextVote) delete next[comment.id];
      setVotes(next);
      window.sessionStorage.setItem("find-comment-votes", JSON.stringify(next));
      await load(page);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not save your vote."); }
    finally { setBusy(false); }
  };

  const remove = async (commentId: number) => {
    if (!adminToken) return;
    if (!window.confirm("Delete this comment?")) return;
    try { await waterApi.deleteComment(commentId, adminToken); await load(page); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Could not delete comment."); }
  };

  return <section className={`comment-thread ${embedded ? "comment-thread-embedded" : ""}`}>
    {!embedded && <div className="d-flex align-items-center justify-content-between border-bottom px-3 py-2"><h2 className="h6 mb-0">Comments</h2><button type="button" className="btn-close" aria-label="Close comments" onClick={onClose} /> </div>}
    {error && <div className="alert alert-danger m-2 py-2" role="alert">{error}</div>}
    <div className="comment-list" aria-live="polite">
      {comments.length === 0 && <p className="text-secondary small text-center py-3 mb-0">No comments yet. Start the conversation.</p>}
      {comments.map(comment => <article className="border-bottom px-3 py-2" key={comment.id}>
        <div className="d-flex align-items-start gap-2">
          <div className="flex-grow-1 min-w-0"><div className="small text-secondary">Community · {new Date(comment.created_at).toLocaleString()}</div><div className="comment-body">{comment.body}</div></div>
          <div className="d-flex align-items-center gap-1"><button className={`btn btn-sm ${comment.my_vote === 1 ? "btn-success" : "btn-outline-secondary"}`} aria-label="Upvote comment" disabled={busy} onClick={() => void vote(comment, 1)}><i className="fa-solid fa-arrow-up" /></button><span className="small fw-semibold" aria-label={`${comment.votes} votes`}>{comment.votes}</span><button className={`btn btn-sm ${comment.my_vote === -1 ? "btn-danger" : "btn-outline-secondary"}`} aria-label="Downvote comment" disabled={busy} onClick={() => void vote(comment, -1)}><i className="fa-solid fa-arrow-down" /></button></div>
        </div>
        {adminToken && <button className="btn btn-link btn-sm text-danger px-0" onClick={() => void remove(comment.id)}>Delete</button>}
      </article>)}
    </div>
    {pages > 1 && <nav className="d-flex align-items-center justify-content-between border-top px-3 py-2" aria-label="Comment pages"><button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => void load(page - 1)}>Previous</button><span className="small text-secondary">{page} / {pages} · {total} comments</span><button className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => void load(page + 1)}>Next</button></nav>}
    <form className="border-top p-2" onSubmit={submit}><label className="visually-hidden" htmlFor={`comment-${reportId ?? "home"}`}>Write a comment</label><textarea id={`comment-${reportId ?? "home"}`} className="form-control" rows={2} maxLength={500} placeholder="Add a comment…" value={body} onChange={event => setBody(event.target.value)} /><div className="d-flex align-items-center justify-content-between mt-2"><span className="small text-secondary">{body.length}/500</span><button className="btn btn-primary" type="submit" disabled={!body.trim() || busy}>Comment</button></div></form>
  </section>;
}
