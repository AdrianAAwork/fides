import type { Metadata } from 'next'
import FidesSeal from '@/src/components/FidesSeal'

export const metadata: Metadata = {
  title: 'Seal Preview — Fides',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}
import FidesSealMono from '@/src/components/FidesSealMono'
import FidesFavicon from '@/src/components/FidesFavicon'

export default function SealPreview() {
  return (
    <div className="min-h-screen bg-[#F4F3F8] p-12 space-y-16">

      {/* Section: Main seal at multiple sizes */}
      <section>
        <h2 className="text-sm font-medium text-[#1A1625] mb-6 tracking-wider uppercase">
          Main seal — colour
        </h2>
        <div className="flex items-end gap-12">
          <div className="flex flex-col items-center gap-2">
            <FidesSeal size={400} />
            <span className="text-xs text-[#8B85A8]">400px — design review</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <FidesSeal size={80} />
            <span className="text-xs text-[#8B85A8]">80px — landing</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <FidesSeal size={56} />
            <span className="text-xs text-[#8B85A8]">56px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <FidesSeal size={32} />
            <span className="text-xs text-[#8B85A8]">32px</span>
          </div>
        </div>
      </section>

      {/* Section: Mono on dark background */}
      <section>
        <h2 className="text-sm font-medium text-[#1A1625] mb-6 tracking-wider uppercase">
          Monochrome — for Auth0 login (dark background)
        </h2>
        <div className="bg-black p-12 rounded-lg flex items-end gap-12">
          <div className="flex flex-col items-center gap-2">
            <FidesSealMono size={400} />
            <span className="text-xs text-white/50">400px — design review</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <FidesSealMono size={80} />
            <span className="text-xs text-white/50">80px — Auth0 login</span>
          </div>
        </div>
      </section>

      {/* Section: Favicon at actual sizes */}
      <section>
        <h2 className="text-sm font-medium text-[#1A1625] mb-6 tracking-wider uppercase">
          Favicon — designed for browser tabs
        </h2>
        <div className="flex items-end gap-12">
          <div className="flex flex-col items-center gap-2">
            <FidesFavicon size={128} />
            <span className="text-xs text-[#8B85A8]">128px — design review</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <FidesFavicon size={64} />
            <span className="text-xs text-[#8B85A8]">64px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <FidesFavicon size={32} />
            <span className="text-xs text-[#8B85A8]">32px — actual tab</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <FidesFavicon size={16} />
            <span className="text-xs text-[#8B85A8]">16px — actual tab</span>
          </div>
        </div>
      </section>

    </div>
  )
}
