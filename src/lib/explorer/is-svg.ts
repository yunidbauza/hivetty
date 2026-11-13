/** Whether a file name is an SVG: text in the editor, an image in its preview. */
export const isSvgFile = (name: string): boolean => /\.svg$/i.test(name);
