import { useEffect, useState } from 'react';
import { api, RequestFailed } from '../../api/client';

interface Similar {
  id: string;
  name: string;
  categoryName: string;
  holderCount: number;
}

/**
 * 관심사 제안 (S4, docs/08 §4).
 *
 * 사용자가 관심사를 직접 만들지는 못한다 — 자유 입력은 "백엔드/백앤드/Backend"처럼
 * 같은 뜻이 흩어져 공통 관심사 계산을 망친다(docs/08 §1).
 *
 * 입력 중 비슷한 기존 관심사를 보여주는 이유는 중복 제안을 줄이기 위해서다.
 */
export function SuggestInterest() {
  const [name, setName] = useState('');
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (name.trim().length < 1) {
      setSimilar([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<Similar[]>(`/interest-suggestions/similar?q=${encodeURIComponent(name.trim())}`)
        .then(setSimilar)
        .catch(() => setSimilar([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [name]);

  const submit = async () => {
    setError(null);
    try {
      await api.post('/interest-suggestions', { name: name.trim() });
      setDone(true);
      setName('');
    } catch (e) {
      setError(e instanceof RequestFailed ? e.message : '보내지 못했습니다.');
    }
  };

  if (done) {
    return (
      <div className="notice">
        제안을 보냈습니다. 운영자가 확인하고 결과를 알려드립니다.
        <br />
        <button
          type="button"
          className="link"
          style={{ marginTop: 6 }}
          onClick={() => setDone(false)}
        >
          다른 관심사도 제안하기
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="없는 관심사 이름"
        maxLength={30}
      />

      {similar.length > 0 && (
        <div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            혹시 이것인가요?
          </p>
          <div className="chips">
            {similar.map((item) => (
              <span key={item.id} className="chip">
                {item.name}
                <span className="count">{item.holderCount}명</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <button
        type="button"
        disabled={name.trim().length < 1}
        onClick={() => void submit()}
      >
        제안하기
      </button>
    </div>
  );
}
