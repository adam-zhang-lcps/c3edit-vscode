{pkgs ? import <nixpkgs> {}}:
with pkgs;
  mkShell {
    buildInputs = [nodejs typescript-language-server vscodium];
  }
