// class to load 7zip wasm module
// and extract files from archive

import SevenZip, { SevenZipModule } from "7z-wasm";

export class FilesManager {
    sevenZip?: SevenZipModule;
    consoleOutputBuffer: string[] = [];
    path: Ref<string> = useSelectedItem();

    constructor(private filesList: Ref<any[]>) {
        this.init();
    }

    async init() {
        this.sevenZip = await SevenZip({
            wasmBinary: await fetch("/7zz.wasm").then((res) => res.arrayBuffer()),
            print: (text) => {
                if (text.lastIndexOf("\b")) {
                    text = text.substring(text.lastIndexOf("\b") + 1);
                }
                this.consoleOutputBuffer.push(text);
            },
        });
    }

    execute(commands: string[]) {
        if (!this.sevenZip) return;
        this.consoleOutputBuffer = [];
        this.sevenZip.callMain(commands);
        return this.consoleOutputBuffer;
    }

    async loadArchive(file: File) {
        if (!this.sevenZip) return;

        const archiveName = file.name;

        const stream = this.sevenZip.FS.open(archiveName, "w+");
        let archiveData = new Uint8Array(await file.arrayBuffer());

        this.sevenZip.FS.write(stream, archiveData, 0, archiveData.byteLength);
        this.sevenZip.FS.close(stream);

        // 7zip get files list
        let filesString = this.execute(["l", "-ba", archiveName]);

        // parse files list
        let unorganizedFiles = filesString!.map((fileString) => {
            let file: RegExpMatchArray = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+(?<type>[AD.]+)\s+(?<size>\d+)\s+(?<compressed>\d+)\s+(?<path>.+)[\n\r]{0,}/.exec(fileString)!;
            let isFolder = file.groups!.type.indexOf("D") > -1 ? true : false;
            return {
                name: file.groups!.path.lastIndexOf('/') > -1 ? file.groups!.path.substring(file.groups!.path.lastIndexOf('/') + 1) : file.groups!.path,
                path: `/${file.groups!.path}`,
                isFolder: isFolder ? true : false,
                content: isFolder ? [] as any[] : undefined,
            }
        });

        // sort unorganized files by depth
        unorganizedFiles = unorganizedFiles.sort((a, b) => {
            if (a.path.split("/").length > b.path.split("/").length) return -1;
            if (a.path.split("/").length < b.path.split("/").length) return 1;
            return 0;
        });

        // sort files and folder inside each folder
        for (let file of unorganizedFiles) {
            // get parent folder file
            let parentFolderFile = unorganizedFiles.find(_file => _file.path == file.path.substring(0, file.path.lastIndexOf("/")));
            if (!parentFolderFile) continue;

            // add file to parent folder content
            parentFolderFile.content!.push(file);
        }

        // remove folders from root
        console.log(unorganizedFiles);
        let files = unorganizedFiles.filter(file => file.path.split("/").length <= 2);
        console.log(files);

        this.filesList.value = files;


        return files;
    }

    // wait until console output is empty
    async waitConsoleOutput() {
        if (!this.sevenZip) return;

        let breakLoop = false;
        let lastLength = this.consoleOutputBuffer.length;
        while (!breakLoop) {
            await new Promise((resolve) => {
                if (lastLength == this.consoleOutputBuffer.length) {
                    return;
                }

                lastLength = this.consoleOutputBuffer.length;
                setTimeout(resolve, 10)
            });
        }

        return;
    }

    getFile(path: string, innerList = undefined): any {
      if (path == "/") {
        return {
          content: this.filesList.value,
          isFolder: true,
        };
      }

      for (const file of (innerList || this.filesList.value)) {
        if (file.path == path) {
          return file;
        }
    
        if (file.isFolder && path.includes(file.path)) {
          let recursiveFile = this.getFile(path, file.content);
          if (recursiveFile) {
            return recursiveFile;
          }
        }
      }
    
      return undefined;
    }
}