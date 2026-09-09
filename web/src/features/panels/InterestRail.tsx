import type { GraphResponse, InterestCatalog } from '@ssafy-net/shared';
import { useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { categoryVar } from '../graph/encoding';

/**
 * 왼쪽 관심사 레일.
 *
 * 그래프에서 작은 노드를 찾아 누르는 것만이 유일한 진입로면 탐색이 힘들다.
 * 목록에서도 같은 선택을 할 수 있게 한다. 리스트가 우위인 곳은 리스트로 둔다
 * (docs/01 §7 — 그래프는 탐색과 이해, 행동과 관리는 리스트).
 *
 * 그래프에 있는 관심사는 선택하고, 그래프 밖 관심사는 앵커를 그쪽으로 옮긴다
 * (docs/07 §2.4 "그래프 밖에 N명 더 있음 · 중심으로 보기"와 같은 규칙).
 *
 * Command(cmdk) 위에 얹었다 — 검색과 방향키 이동이 따라온다. 걸러내는 것은
 * 여기서 직접 한다(shouldFilter=false): 검색은 전체 목록, 평소에는 그래프 안 관심사.
 */
export function InterestRail({
  graph,
  catalog,
  selectedId,
  anchorIds,
  onSelect,
  onRecenter,
}: {
  graph: GraphResponse | null;
  catalog: InterestCatalog | null;
  selectedId: string | null;
  /** 앵커인 관심사. 행에 "중심" 표시가 붙는다. */
  anchorIds: string[];
  onSelect: (interestId: string) => void;
  onRecenter: (interestId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const anchorSet = new Set(anchorIds);

  const inGraph = useMemo(() => {
    const map = new Map<string, { name: string; categoryId: string; mine: boolean }>();
    graph?.nodes.forEach((node) => {
      if (node.kind === 'INTEREST') {
        map.set(node.id, {
          name: node.name,
          categoryId: node.categoryId,
          mine: node.mine,
        });
      }
    });
    return map;
  }, [graph]);

  const normalized = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!normalized || !catalog) return [];
    return catalog.categories
      .flatMap((category) =>
        category.interests.map((interest) => ({ ...interest, category })),
      )
      .filter((interest) => interest.name.toLowerCase().includes(normalized))
      .slice(0, 30);
  }, [normalized, catalog]);

  const mine = [...inGraph].filter(([, value]) => value.mine);
  const adjacent = [...inGraph].filter(([, value]) => !value.mine);

  const Row = ({
    id,
    name,
    categoryId,
    suffix,
    onPick,
  }: {
    id: string;
    name: string;
    categoryId: string;
    suffix?: string;
    onPick: () => void;
  }) => {
    const selected = selectedId === id;
    return (
      <CommandItem
        value={id}
        onSelect={onPick}
        className={cn(
          'cursor-pointer gap-2 rounded-[7px] px-2 py-[7px] text-[13.5px] text-foreground data-[selected=true]:bg-secondary data-[selected=true]:text-foreground',
          selected &&
            'bg-accent font-semibold text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
        )}
      >
        <i
          className="size-2 flex-none rounded-full"
          style={{ background: categoryVar(categoryId) }}
        />
        <span className="truncate">{name}</span>
        {(suffix || anchorSet.has(id)) && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {anchorSet.has(id) ? '중심' : suffix}
          </span>
        )}
      </CommandItem>
    );
  };

  return (
    <aside className="h-full border-r bg-card">
      <ScrollArea className="h-full">
        <Command
          shouldFilter={false}
          className="h-auto bg-transparent px-2.5 pt-3.5 pb-7 wide:px-3 wide:pt-4 wide:pb-8"
        >
          <div className="mb-3.5 rounded-md border border-input bg-card focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 [&_[data-slot=command-input-wrapper]]:h-9 [&_[data-slot=command-input-wrapper]]:border-b-0 [&_[data-slot=command-input-wrapper]]:px-2.5">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="관심사 검색"
              className="h-9 text-[13px]"
            />
          </div>

          <CommandList className="max-h-none overflow-visible">
            {normalized ? (
              <>
                <CommandEmpty className="px-1.5 py-4 text-left text-xs leading-normal text-muted-foreground">
                  결과가 없습니다.
                </CommandEmpty>
                <CommandGroup heading="검색 결과" className="p-0">
                  {searchResults.map((interest) => (
                    <Row
                      key={interest.id}
                      id={interest.id}
                      name={interest.name}
                      categoryId={interest.category.id}
                      suffix={`${interest.holderCount}명`}
                      onPick={() =>
                        inGraph.has(interest.id)
                          ? onSelect(interest.id)
                          : onRecenter(interest.id)
                      }
                    />
                  ))}
                </CommandGroup>
              </>
            ) : (
              <>
                <CommandGroup heading="내 관심사" className="p-0">
                  {mine.map(([id, value]) => (
                    <Row
                      key={id}
                      id={id}
                      name={value.name}
                      categoryId={value.categoryId}
                      onPick={() => onSelect(id)}
                    />
                  ))}
                </CommandGroup>

                {adjacent.length > 0 && (
                  <CommandGroup heading="이 그래프에 함께 보이는 관심사" className="mt-3 p-0">
                    {adjacent.map(([id, value]) => (
                      <Row
                        key={id}
                        id={id}
                        name={value.name}
                        categoryId={value.categoryId}
                        onPick={() => onSelect(id)}
                      />
                    ))}
                  </CommandGroup>
                )}

                <p className="mx-1.5 mt-4 text-xs leading-normal text-muted-foreground">
                  목록에 없는 관심사는 검색해서 그 관심사를 중심으로 볼 수 있습니다.
                </p>
              </>
            )}
          </CommandList>
        </Command>
      </ScrollArea>
    </aside>
  );
}
