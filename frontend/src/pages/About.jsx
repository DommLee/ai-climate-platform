import React from "react";

export default function About() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-5 text-2xl font-black tracking-tight">Hakkımızda</h2>

        <div className="space-y-3 text-zinc-200">
          <p className="text-lg font-semibold">Dokuz Eylül Üniversitesi</p>
          <p>Uluslararası Ticaret ve İşletmecilik</p>
          <p className="font-semibold">IBS 4498 ARTIFICIAL INTELLIGENCE FOR TRADE AND BUSINES</p>

          <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
            <p className="mb-2 font-semibold">by :</p>
            <p>Abdullah YILDIZ 2021439045</p>
            <p>Dilnaz Amangeldinova 2022439068</p>
            <p>RİDUAN MAKHAMMADSHARIF 2021439077</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-2 text-lg font-bold">İletişim</h3>
        <p className="text-zinc-200">Abdullah Yildiz (DommLee) - abdullahyldxz@gmail.com</p>
      </section>
    </div>
  );
}
