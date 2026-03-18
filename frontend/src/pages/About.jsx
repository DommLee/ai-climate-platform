import React from "react";
import { GraduationCap, Mail, User } from "lucide-react";

export default function About() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
            <GraduationCap size={20} />
          </div>
          <h2 className="text-2xl font-black tracking-tight">Hakkýmýzda</h2>
        </div>

        <div className="space-y-2 text-zinc-200">
          <p className="text-lg font-semibold">Dokuz Eylül Üniversitesi</p>
          <p>Uluslararasý Ticaret ve Ýþletmecilik</p>
          <p className="font-semibold">IBS 4498 ARTIFICIAL INTELLIGENCE FOR TRADE AND BUSINES</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-3 text-lg font-bold">Proje Ekibi</h3>
          <ul className="space-y-2 text-zinc-200">
            <li>Abdullah YILDIZ - 2021439045</li>
            <li>Dilnaz Amangeldinova - 2022439068</li>
            <li>RÝDUAN MAKHAMMADSHARIF - 2021439077</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-3 text-lg font-bold">Ýletiþim / Ýmza</h3>
          <div className="space-y-2 text-zinc-200">
            <p className="flex items-center gap-2"><User size={16} /> Abdullah Yildiz</p>
            <p className="flex items-center gap-2"><Mail size={16} /> abdullahyldxz@gmail.com</p>
            <p><span className="font-semibold">Nickname:</span> DommLee</p>
          </div>
        </article>
      </section>
    </div>
  );
}
