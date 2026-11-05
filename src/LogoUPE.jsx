import React from "react";

export default function LogoUPE({ compacta = false }) {
  return (
    <div className={compacta ? "marca-upe marca-upe-compacta" : "marca-upe"}>
      <img src="/upe-logo.png" alt="Universidade de Pernambuco" />
      {!compacta && (
        <div className="marca-upe-texto">
          <strong>Atividades Complementares</strong>
          <span>FCAP · Universidade de Pernambuco</span>
        </div>
      )}
    </div>
  );
}
