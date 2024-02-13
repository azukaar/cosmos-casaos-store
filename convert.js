const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const yaml = require('yaml');

// Function to clone the GitHub repository
async function cloneRepo(repoUrl, targetFolder) {
  // Construct the full clone command
  const command = `git clone ${repoUrl} ${targetFolder}`;

  // Execute the command
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Error: ${stderr}`);
      return;
    }
    console.log(`Repository cloned successfully:\n${stdout}`);
  });
}

async function scanFiles(folder) {
  console.log("Scanning folder: "+folder)
  // list all the folders in the target folder
  const folders = fs.readdirSync(folder);
  const foldersSub = [];

  for (const subfolder of folders) {
    const subfolderPath = path.join(folder, subfolder);
    const files = fs.readdirSync(subfolderPath);
    for (const file of files) {
      if (file === 'docker-compose.yml') {
        foldersSub[subfolder] = subfolderPath
      }
    }
  }

  return foldersSub;
}

function composeConvert(input) {
  // change $AppID to {ServiceName}
  let output = input.replace(/\$AppID/g, '{ServiceName}');
  output = output.replace(/\$PGID/g, '1000');
  output = output.replace(/\$PUID/g, '1000');
  output = output.replace(/\$TZ/g, 'auto');

  // change source: /DATA/AppData/ to source: {DefaultDataPath}/
  // output = output.replace(/source: \/DATA\/AppData\//g, 'source: \\{DefaultDataPath}/');

  // add store
  output = `cosmos-installer:\n${output}`

  // parse yml
  const doc = yaml.parse(output);

  // convert services names to {ServiceName}-name
  for (const [name, service] of Object.entries(doc.services)) {
    let newName = '{ServiceName}-'+name;
    if(Object.entries(doc.services).length === 1) {
      newName = '{ServiceName}';
    }

    service.container_name = newName;
    service.hostname = newName;

    let volumeIndex = 1;

    // convert volumes
    service.volumes = service.volumes && service.volumes.map(volume => {
      // if string, replace
      if (typeof volume === 'string') {
        if (volume.startsWith('/DATA/AppData/')) {
          const r=  '{ServiceName}-data' + (volumeIndex === 1 ? '' : `-${volumeIndex}`);
          volumeIndex++;
          return r;
        }
        return volume.replace('/DATA/', '{DefaultDataPath}/');
      } else if (typeof volume === 'object') {
        // if object, replace source
        if (volume.source.startsWith('/DATA/AppData/')) {
          volume.source = '{ServiceName}-data' + (volumeIndex === 1 ? '' : `-${volumeIndex}`);
          volumeIndex++;
        } else { 
          volume.source = volume.source.replace('/DATA/', '{DefaultDataPath}/');
        }
        volume.type = volume.source[0] === '/' ? 'bind' : 'volume';
        return volume;
      }
    });

    // convert ports
    service.ports = service.ports && service.ports.map(port => {
      // if string, replace
      if (typeof port === 'object') {
        return port.protocol ? `${port.published}:${port.target}/${port.protocol}` : `${port.published}:${port.target}`;
      } else {
        return port;
      }
    });

    delete service['x-casaos']

    doc.services[newName] = service;
    delete doc.services[name];
  }

  doc["minVersion"] = "0.14.0";

  delete doc['x-casaos']

  return yaml.stringify(doc);
}

function descriptionConvert(name, input) {
  const doc = yaml.parse(input)['x-casaos'];

  let output = {
    name: name,
    description: (doc.tagline || doc.overview || doc.description).en_us,
    longDescription: (doc.description || doc.overview || doc.tagline).en_us,
    tags: [doc.category],
    "repository": "https://github.com/IceWhaleTech/CasaOS-AppStore",
    "image": "",
    "supported_architectures": doc.architectures,
  }

  let screenshots = doc.screenshot_link ? doc.screenshot_link.map((screenshot, index) => {
    return screenshot.split('/').pop();
  }) : [];

  return [output, screenshots, doc.icon.split('/').pop()];
}

function extractImages(folder) {
  // list all the images (png, jpg, jpeg, ico) that start with screenshot
  const images = fs.readdirSync(folder);
  const imagesSub = [];
  let icon = ''; 

  for (const image of images) {
    if ((image.endsWith('.png') || image.endsWith('.webp') || image.endsWith('.jpg') || image.endsWith('.jpeg') || image.endsWith('.ico'))) {
      if (image.startsWith('screenshot')) {
        imagesSub.push(image);
      } else if (image.startsWith('icon')) {
        icon = image;
      }
    }
  }

  return [imagesSub, icon];
}

// Example usage
const repoUrl = 'https://github.com/IceWhaleTech/CasaOS-AppStore';
const targetFolder = path.join(__dirname, 'casaos');

async function run() {
  console.log("Starting to clone the repository...")
  // await cloneRepo(repoUrl, targetFolder);
  
  console.log("Cloned the repository, analysing the files...")
  const composeFiles = await scanFiles(path.join(targetFolder, "Apps"));
  
  console.log("Exporting "+Object.keys(composeFiles).length+" docker-compose.yml files...");
  // if output folder exist, remove it
  if (fs.existsSync(path.join(__dirname, 'servapps'))) {
    fs.rmSync(path.join(__dirname, 'servapps'), { recursive: true });
  }

  for (const [name, appPath] of Object.entries(composeFiles)) {
    try {
      const data = composeConvert(fs.readFileSync(path.join(appPath, 'docker-compose.yml'), 'utf8'));
      const [description, _, _1] = descriptionConvert(name, fs.readFileSync(path.join(appPath, 'docker-compose.yml'), 'utf8'));
      const [screenshots, icon] = extractImages(appPath);
      // create folders
      fs.mkdirSync(path.join(__dirname, 'servapps', name, "screenshots"), { recursive: true });
      fs.writeFileSync(path.join(__dirname, 'servapps', name, 'docker-compose.yml'), data);
      fs.writeFileSync(path.join(__dirname, 'servapps', name, 'description.json'), JSON.stringify(description, null, 2));
      for (let i = 0; i < screenshots.length; i++) {
        fs.copyFileSync(path.join(appPath, screenshots[i]), path.join(__dirname, 'servapps', name, "screenshots", screenshots[i]));
      }
      fs.copyFileSync(path.join(appPath, icon), path.join(__dirname, 'servapps', name, "icon.png"));
    } catch (err) {
      console.error("error with "+name+": "+err);
    }
  }
}

run();