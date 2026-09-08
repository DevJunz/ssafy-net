import { currentScene, resetDemo, setScene } from '.';
import './demo-banner.css';

/**
 * 데모 빌드에만 뜨는 띠.
 *
 * 두 가지를 한다. 하나는 **이것이 실제 서비스가 아님을 분명히 하는 것**이고,
 * 다른 하나는 디자이너가 온보딩처럼 되돌아가기 어려운 화면을 다시 보게 하는 것이다.
 */
export function DemoBanner() {
  const scene = currentScene();

  return (
    <div className="demo-banner">
      <span className="demo-tag">데모</span>
      <span className="demo-text">
        서버 없이 캡처한 데이터로 도는 화면입니다. 무엇을 눌러도 실제로 저장되지 않습니다.
      </span>

      <div className="demo-actions">
        <button
          type="button"
          className={scene === 'app' ? 'on' : ''}
          onClick={() => (scene === 'app' ? resetDemo() : setScene('app'))}
        >
          앱 둘러보기
        </button>
        <button
          type="button"
          className={scene === 'onboarding' ? 'on' : ''}
          onClick={() => (scene === 'onboarding' ? resetDemo() : setScene('onboarding'))}
        >
          가입 화면부터
        </button>
        <button type="button" onClick={resetDemo}>
          처음으로
        </button>
      </div>
    </div>
  );
}
