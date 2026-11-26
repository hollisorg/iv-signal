# Code signing

## Windows release builds

Sign in to the Hollis Organization tenant with Azure CLI, using an account with the
Artifact Signing Certificate Profile Signer role on the iv-windows certificate profile.
Install the Windows SDK (22621 or newer, with x64 SignTool) and the .NET 10 x64 runtime.
Run `npm run dist:win-release` to build and verify Windows release assets in `dist/`.

The scripts sign Windows executables and the NSIS installer before Electron Builder generates
the updater manifest and blockmap. The build verifies the Hollis Organization Inc publisher,
the Microsoft timestamp, and the installer checksum in the manifest.

The release script always uses this signed Windows build.
