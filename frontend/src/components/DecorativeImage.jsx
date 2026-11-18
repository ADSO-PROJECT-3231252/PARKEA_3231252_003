// 1 x 1 transparent GIF. A <picture> needs an <img> with a src, and this one
// keeps the browser from downloading the real image when no <source> matches.
const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// Decorative image that is downloaded only from minWidth up. Hiding an <img>
// with CSS (hidden, md:flex on the parent) does not stop the download, so on
// a phone the image would be fetched and never seen. Keep minWidth equal to
// the Tailwind breakpoint that shows the image, written in rem (Tailwind 4:
// md = 48rem, lg = 64rem), so the download and the layout change together.
// The picture has display: contents so the img keeps its place in the layout.
// The source is hidden too: inside a display: contents picture it would be
// one more (empty) item of the flex parent and add one more gap.
export default function DecorativeImage({ src, minWidth, className, style }) {
    return (
        <picture className="contents">
            <source media={`(min-width: ${minWidth})`} srcSet={src} className="hidden" />
            <img src={BLANK_PIXEL} alt="" aria-hidden="true" className={className} style={style} />
        </picture>
    );
}
