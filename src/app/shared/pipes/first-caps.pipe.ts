import { Pipe, PipeTransform } from '@angular/core';

export function firstCaps(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text
    .split(/\s+/)
    .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word)
    .join(' ');
}

@Pipe({
  standalone: false,
  name: 'firstCaps'
})
export class FirstCapsPipe implements PipeTransform {
  transform(value: unknown): string {
    return firstCaps(value);
  }
}
