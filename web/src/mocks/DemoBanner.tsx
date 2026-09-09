import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { currentScene, resetDemo, setScene } from '.';

/**
 * 데모 빌드에만 뜨는 띠. 실제 서비스 번들에는 이 화면이 없다.
 *
 * 두 가지를 한다. 하나는 **이것이 실제 서비스가 아님을 분명히 하는 것**이고,
 * 다른 하나는 디자이너가 온보딩처럼 되돌아가기 어려운 화면을 다시 보게 하는 것이다.
 */
export function DemoBanner() {
  const scene = currentScene();

  const sceneButton = (on: boolean) =>
    cn(
      'h-auto border-[#e9f1f8]/35 bg-transparent px-2.5 py-1 text-xs text-inherit hover:bg-[#e9f1f8]/12 hover:text-inherit',
      on && 'border-[#e9f1f8] bg-[#e9f1f8] font-semibold text-[#1c2b3a] hover:bg-[#e9f1f8] hover:text-[#1c2b3a]',
    );

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2.5 bg-[#1c2b3a] px-4 py-2 text-[13px] text-[#e9f1f8]">
      <span className="flex-none rounded-full bg-[#f0b429] px-2 py-0.5 text-xs font-bold tracking-wide text-[#23303d]">
        데모
      </span>
      <span className="min-w-0 flex-[1_1_240px] opacity-85 max-[560px]:hidden">
        서버 없이 캡처한 데이터로 도는 화면입니다. 무엇을 눌러도 실제로 저장되지 않습니다.
      </span>

      <div className="flex flex-none gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="xs"
          className={sceneButton(scene === 'app')}
          onClick={() => (scene === 'app' ? resetDemo() : setScene('app'))}
        >
          앱 둘러보기
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className={sceneButton(scene === 'onboarding')}
          onClick={() =>
            scene === 'onboarding' ? resetDemo() : setScene('onboarding')
          }
        >
          가입 화면부터
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className={sceneButton(false)}
          onClick={resetDemo}
        >
          처음으로
        </Button>
      </div>
    </div>
  );
}
