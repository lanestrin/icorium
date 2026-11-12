/** Joins the class names that apply, skipping false, null and undefined: classNames('a', on && 'b'). */
export function classNames(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(' ');
}
