import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui 관례. Tailwind 클래스를 합치되 충돌하는 것은 뒤의 것이 이긴다. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
