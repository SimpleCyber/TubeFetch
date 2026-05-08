"use client";

import { FiArrowLeft, FiShield, FiLock, FiEye, FiFileText } from 'react-icons/fi';
import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#F8F9FB] text-slate-900 font-sans">
      {/* Header */}
      <header className="max-w-[1000px] mx-auto px-6 py-8 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="relative w-6 h-6 flex items-center justify-center">
            <div className="absolute left-0 w-3 h-5 bg-red-600 rounded-sm rotate-12"></div>
            <div className="absolute right-0 w-3 h-6 bg-slate-900 rounded-sm -rotate-12"></div>
          </div>
          <span className="text-2xl font-black tracking-[0.15em] text-slate-900 ml-2">OMNIFETCH</span>
        </Link>
        
        <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-900 flex items-center gap-2 transition-colors">
          <FiArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </header>

      <main className="max-w-[800px] mx-auto px-6 py-12">
        <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white">
          <h1 className="text-4xl font-black text-slate-900 mb-8 flex items-center gap-4">
            <FiShield className="text-red-600" /> Privacy Policy
          </h1>

          <div className="space-y-8 text-slate-600 leading-relaxed">
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <FiEye className="text-blue-500" /> Information We Collect
              </h2>
              <p>
                OmniFetch is designed to be as private as possible. We do not store any personal data, video history, or downloaded content on our servers. The video URLs you provide are processed temporarily to facilitate the download and are not logged.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <FiLock className="text-green-500" /> Data Security
              </h2>
              <p>
                All communication between your browser and our servers is encrypted via SSL/TLS. We use industry-standard practices to ensure that your requests are handled securely.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <FiFileText className="text-purple-500" /> Usage Terms
              </h2>
              <p>
                By using OmniFetch, you agree to respect the copyright and terms of service of the content platforms you are downloading from. OmniFetch is intended for personal use and archival purposes only.
              </p>
            </section>

            <div className="pt-8 border-t border-slate-100">
              <p className="text-sm text-slate-400">
                Last updated: May 6, 2026. For any questions regarding this policy, please contact us through our official channels.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-[1000px] mx-auto px-6 py-12 text-center text-slate-400 text-sm font-medium">
        © 2026 OmniFetch. All rights reserved.
      </footer>
    </div>
  );
}
