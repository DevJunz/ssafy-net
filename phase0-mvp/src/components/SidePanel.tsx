import { useState } from 'react';
import { ME_ID, networkSuggestions, type Post } from '../data/mock';
import {
  commonInterests,
  interestById,
  interestsOf,
  networkById,
  similarPeople,
  userById,
  usersOf,
  type Mode,
} from '../lib/graph';

type Props = {
  mode: Mode;
  posts: Post[];
  requested: Set<string>;
  onSelectPerson: (id: string) => void;
  onSelectInterest: (id: string) => void;
  onShowSimilar: () => void;
  onShowNetwork: (id: string) => void;
  onFocusSimilar: (id: string) => void;
  onRequestConnect: (id: string) => void;
  onAddPost: (interestId: string, content: string) => void;
};

function InterestChip({ id, onClick }: { id: string; onClick?: () => void }) {
  const it = interestById.get(id);
  if (!it) return null;
  return (
    <button
      className="chip"
      style={{ background: `${it.color}1a`, color: it.color, borderColor: `${it.color}55` }}
      onClick={onClick}
    >
      #{it.name}
    </button>
  );
}

function PersonRow({ id, onClick, meta }: { id: string; onClick: () => void; meta?: string }) {
  const u = userById.get(id);
  if (!u) return null;
  return (
    <button className="person-row" onClick={onClick}>
      <span className={`avatar ${u.id === ME_ID ? 'me' : ''}`}>{u.name[0]}</span>
      <span className="person-name">{u.name}</span>
      <span className="person-meta">{meta ?? u.team}</span>
    </button>
  );
}

export default function SidePanel(props: Props) {
  const { mode } = props;
  switch (mode.type) {
    case 'explore':
      return <ExplorePanel {...props} />;
    case 'person':
      return <PersonPanel {...props} personId={mode.id} />;
    case 'interest':
      return <InterestPanel {...props} interestId={mode.id} />;
    case 'similar':
      return <SimilarPanel {...props} focusId={mode.focusId} />;
    case 'network':
      return <NetworkPanel {...props} networkId={mode.id} />;
  }
}

// ---------- Explore ----------

function ExplorePanel({ onShowSimilar, onShowNetwork, onSelectPerson }: Props) {
  return (
    <div className="panel">
      <h2>Interest Network</h2>
      <p className="muted">
        큰 원은 <b>관심사</b>, 작은 점은 <b>사람</b>입니다. 노드를 클릭해 보세요.
      </p>
      <ul className="legend">
        <li>
          <span className="dot me" /> 나
        </li>
        <li>
          <span className="dot person" /> 다른 사람
        </li>
        <li>
          <span className="dot interest" /> 관심사
        </li>
      </ul>

      <div className="section">
        <button className="btn primary block" onClick={onShowSimilar}>
          나와 비슷한 사람 보기
        </button>
        <p className="hint">공통 관심사가 3개 이상인 사람을 나와 직접 연결해서 보여줍니다.</p>
      </div>

      <div className="section">
        <h3>추천 네트워크</h3>
        <p className="hint">멤버 전원이 5개 이상의 관심사를 공유하는 그룹입니다.</p>
        {networkSuggestions.map((n, idx) => (
          <div className="card" key={n.id}>
            <div className="card-title">
              네트워크 {idx + 1}
              {n.memberIds.includes(ME_ID) && <span className="badge">나 포함</span>}
            </div>
            <div className="card-members">
              {n.memberIds.map((id) => (
                <button className="link" key={id} onClick={() => onSelectPerson(id)}>
                  {userById.get(id)?.name}
                </button>
              ))}
            </div>
            <div className="chips">
              {n.commonInterestIds.map((id) => (
                <InterestChip id={id} key={id} />
              ))}
            </div>
            <button className="btn block" onClick={() => onShowNetwork(n.id)}>
              이 네트워크 보기
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Person ----------

function PersonPanel({
  personId,
  requested,
  onRequestConnect,
  onSelectInterest,
}: Props & { personId: string }) {
  const user = userById.get(personId);
  if (!user) return null;
  const mine = interestsOf(ME_ID);
  const theirs = interestsOf(personId);
  const isMe = personId === ME_ID;
  const common = isMe ? [] : commonInterests(ME_ID, personId);
  const sent = requested.has(personId);

  return (
    <div className="panel">
      <div className="person-head">
        <span className={`avatar lg ${isMe ? 'me' : ''}`}>{user.name[0]}</span>
        <div>
          <h2>{user.name}</h2>
          <div className="muted">{user.team}</div>
        </div>
      </div>

      <div className="section">
        <h3>관심사 {theirs.length}개</h3>
        <div className="chips">
          {theirs.map((id) => (
            <InterestChip id={id} key={id} onClick={() => onSelectInterest(id)} />
          ))}
        </div>
      </div>

      {!isMe && (
        <>
          <div className="section">
            <h3>나와 공통 관심사</h3>
            {common.length === 0 ? (
              <p className="hint">공통 관심사가 없습니다.</p>
            ) : (
              <div className="chips">
                {common.map((id) => (
                  <InterestChip id={id} key={id} onClick={() => onSelectInterest(id)} />
                ))}
              </div>
            )}
            <div className="stat">
              공통 관심사 <b>{common.length}개</b>
              <span className="muted"> / 내 관심사 {mine.length}개</span>
            </div>
          </div>

          <div className="section">
            <button
              className={`btn primary block ${sent ? 'done' : ''}`}
              disabled={sent}
              onClick={() => onRequestConnect(personId)}
            >
              {sent ? '연결 요청 보냄 ✓' : '연결 요청'}
            </button>
            <p className="hint">연결이 수락되면 사내 메신저에서 대화를 이어갑니다.</p>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Interest ----------

function InterestPanel({
  interestId,
  posts,
  onSelectPerson,
  onAddPost,
}: Props & { interestId: string }) {
  const it = interestById.get(interestId);
  const [draft, setDraft] = useState('');
  const [writing, setWriting] = useState(false);
  if (!it) return null;
  const people = usersOf(interestId);
  const iHaveIt = people.includes(ME_ID);
  const interestPosts = posts.filter((p) => p.interestId === interestId);

  return (
    <div className="panel">
      <h2 style={{ color: it.color }}>#{it.name}</h2>
      <div className="stat">
        관심 있는 사람 <b>{people.length}명</b>
        {iHaveIt && <span className="badge">나도 관심</span>}
      </div>

      <div className="section">
        <h3>사람</h3>
        <div className="people-list">
          {people.map((id) => (
            <PersonRow
              key={id}
              id={id}
              onClick={() => onSelectPerson(id)}
              meta={id === ME_ID ? '나' : `공통 ${commonInterests(ME_ID, id).length}개`}
            />
          ))}
        </div>
      </div>

      <div className="section">
        <h3>최근 글</h3>
        {interestPosts.length === 0 && <p className="hint">아직 글이 없습니다.</p>}
        {interestPosts.map((p) => (
          <div className="post" key={p.id}>
            <div className="post-head">
              <button className="link" onClick={() => onSelectPerson(p.userId)}>
                {userById.get(p.userId)?.name}
              </button>
              <span className="muted">{p.createdAt}</span>
            </div>
            <div className="post-body">{p.content}</div>
          </div>
        ))}
        {writing ? (
          <div className="compose">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`#${it.name}에 대해 이야기해 보세요`}
              rows={3}
            />
            <div className="row">
              <button
                className="btn primary"
                disabled={!draft.trim()}
                onClick={() => {
                  onAddPost(interestId, draft.trim());
                  setDraft('');
                  setWriting(false);
                }}
              >
                올리기
              </button>
              <button className="btn" onClick={() => setWriting(false)}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <button className="btn block" onClick={() => setWriting(true)}>
            글 작성
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Similar People ----------

function SimilarPanel(props: Props & { focusId?: string }) {
  const { focusId, onFocusSimilar, requested, onRequestConnect, onSelectInterest } = props;
  const sims = similarPeople(ME_ID);
  const focused = sims.find((s) => s.userId === focusId);

  return (
    <div className="panel">
      <h2>나와 비슷한 사람</h2>
      <p className="muted">
        공통 관심사 <b>3개 이상</b>인 사람 {sims.length}명. 빨간 선의 숫자는 공통 관심사 개수입니다.
      </p>

      {focused && (
        <div className="card highlight">
          <div className="card-title">
            나 ── {focused.common.length} ── {userById.get(focused.userId)?.name}
          </div>
          <div className="chips">
            {focused.common.map((id) => (
              <InterestChip id={id} key={id} onClick={() => onSelectInterest(id)} />
            ))}
          </div>
          <button
            className={`btn primary block ${requested.has(focused.userId) ? 'done' : ''}`}
            disabled={requested.has(focused.userId)}
            onClick={() => onRequestConnect(focused.userId)}
          >
            {requested.has(focused.userId) ? '연결 요청 보냄 ✓' : '연결 요청'}
          </button>
        </div>
      )}

      <div className="section">
        <div className="people-list">
          {sims.map((s) => (
            <PersonRow
              key={s.userId}
              id={s.userId}
              onClick={() => onFocusSimilar(s.userId)}
              meta={`공통 ${s.common.length}개`}
            />
          ))}
        </div>
        <p className="hint">선(edge)이나 사람을 클릭하면 공통 관심사가 그래프에 강조됩니다.</p>
      </div>
    </div>
  );
}

// ---------- Network ----------

function NetworkPanel({ networkId, onSelectPerson, onSelectInterest }: Props & { networkId: string }) {
  const net = networkById(networkId);
  if (!net) return null;
  const idx = networkSuggestions.findIndex((n) => n.id === networkId);
  const includesMe = net.memberIds.includes(ME_ID);

  return (
    <div className="panel">
      <h2>
        추천 네트워크 {idx + 1}
        {includesMe && <span className="badge">나 포함</span>}
      </h2>
      <p className="muted">
        멤버 {net.memberIds.length}명이 <b>{net.commonInterestIds.length}개</b>의 관심사를 모두 공유합니다.
      </p>

      <div className="section">
        <h3>멤버</h3>
        <div className="people-list">
          {net.memberIds.map((id) => (
            <PersonRow key={id} id={id} onClick={() => onSelectPerson(id)} />
          ))}
        </div>
      </div>

      <div className="section">
        <h3>공통 관심사</h3>
        <div className="chips">
          {net.commonInterestIds.map((id) => (
            <InterestChip id={id} key={id} onClick={() => onSelectInterest(id)} />
          ))}
        </div>
      </div>

      {!includesMe && (
        <p className="hint">이 네트워크에는 내가 포함되어 있지 않습니다. (다른 사람들에게 추천되는 예시)</p>
      )}
    </div>
  );
}
