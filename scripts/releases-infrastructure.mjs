/** Provision release hosting. Never reads or stores AWS credentials itself. */
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{apply:{type:'boolean',default:false},profile:{type:'string'},account:{type:'string'}}});
const root=fileURLToPath(new URL('..',import.meta.url));
const config=JSON.parse(readFileSync(join(root,'infrastructure/releases/config.json'),'utf8'));
const env={...process.env,AWS_PAGER:''};
if(values.profile)env.AWS_PROFILE=values.profile;
function aws(args){return execFileSync('aws',[...args,'--region',config.region,'--no-cli-pager'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});}
function json(args){return JSON.parse(aws([...args,'--output','json']));}
const identity=json(['sts','get-caller-identity']);
const expected=values.account??config.account;
if(identity.Account!==expected)throw Error(`Wrong AWS account: authenticated ${identity.Account}, expected ${expected}. Select the correct --profile. Use --account only when intentionally deploying elsewhere.`);
const template=join(root,'infrastructure/releases/stack.yaml');
json(['cloudformation','validate-template','--template-body','file://'+template]);
console.log(`Validated ${config.stack} for AWS account ${identity.Account} in ${config.region}.`);
if(!values.apply){console.log('No resources changed. Add --apply to deploy.');process.exit(0);}
execFileSync('aws',['cloudformation','deploy','--template-file',template,'--stack-name',config.stack,'--region',config.region,'--no-fail-on-empty-changeset','--tags','Project=UnderTheCanopy','Purpose=DesktopReleases','--no-cli-pager'],{env,stdio:'inherit'});
const stack=json(['cloudformation','describe-stacks','--stack-name',config.stack]).Stacks[0];
const outputs=Object.fromEntries(stack.Outputs.map(o=>[o.OutputKey,o.OutputValue]));
const deployment={account:identity.Account,region:config.region,stack:config.stack,...outputs};
writeFileSync(join(root,'infrastructure/releases/deployment.json'),JSON.stringify(deployment,null,2)+'\n');
const temp=mkdtempSync(join(tmpdir(),'canopy-release-bootstrap-'));
try{
 for(const [name,document] of Object.entries({
  'health.json':{service:'under-the-canopy-releases',status:'ready'},
  'changelog.json':{schemaVersion:1,releases:[]},
 })){
  const file=join(temp,name);writeFileSync(file,JSON.stringify(document,null,2)+'\n');
  try{aws(['s3api','put-object','--bucket',outputs.BucketName,'--key','updates/'+name,'--body',file,'--content-type','application/json','--cache-control','public, max-age=60',...(name==='changelog.json'?['--if-none-match','*']:[])]);}
  catch(error){if(!String(error.stderr).includes('PreconditionFailed'))throw error;}
 }
}finally{rmSync(temp,{recursive:true,force:true});}
const response=await fetch(outputs.BaseUrl+'/health.json',{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`Stack deployed, but HTTPS health check returned ${response.status}; inspect deployment.json and CloudFront deployment status.`);
if((await response.json()).service!=='under-the-canopy-releases')throw Error('Unexpected release-host response');
console.log(`Release hosting ready: ${outputs.BaseUrl}`);
console.log(`Changelog index: ${outputs.ChangelogIndexUrl}`);
console.log('The update feed is managed by release:publish; infrastructure deployment preserves published releases.');
