// Whether a live session is running right now (server side).
export function sessionIsLive(live) {
  const status = live.state.topics.SessionStatus?.Status;
  return live.info().status === 'connected' && ['Started', 'Aborted', 'Inactive'].includes(status) && Boolean(live.state.topics.SessionInfo?.Path);
}
