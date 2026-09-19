//--------------------------------------------------------------------------------------
// File:		WaterCompute.fx
// Description:	
// Date:		24/07/11 8:35 PM
//--------------------------------------------------------------------------------------
//#define SHOW_WAVES

#include "../Common.fxh"
#include "../Lighting.fxh"

#include "Shared.fxh"
#include "TerrainCommon.fxh"

//--------------------------------------------------------------------------------------
// Global variables
//--------------------------------------------------------------------------------------
CONST_BUFFER_BEGIN(CB_SHARED, SCOURING_WATERCOMPUTE)
	//DECLARE_FLOAT4_ARRAY(g_frustumDirs, EC_WATERCOMPUTE_FRUSTUMDIRS, 4)
	DECLARE_FLOAT2(g_vBlocksMinXZ, EC_WATERCOMPUTE_BLOCKS_MINXZ)
	DECLARE_FLOAT2(g_vBlocksSizeXZ, EC_WATERCOMPUTE_BLOCKS_SIZEXZ)
	DECLARE_FLOAT2(g_vCameraFovData, EC_WATERCOMPUTE_CAMERAFOVDATA)
	DECLARE_FLOAT(g_fSimulationTime, EC_WATERCOMPUTE_SIMULATIONTIME)	
CONST_BUFFER_END;

CONST_BUFFER_BEGIN(CB_INSTANCE, SCOURING_WATERCOMPUTE)
	DECLARE_FLOAT4(g_vFoamScale0, EC_WATERCOMPUTE_FOAMSCALE0)
	DECLARE_FLOAT4(g_vFoamScale1, EC_WATERCOMPUTE_FOAMSCALE1)
	DECLARE_FLOAT4(g_vFoamWeights, EC_WATERCOMPUTE_FOAMWEIGHTS)
CONST_BUFFER_END;

//-----------------------------------------------------------------------------
// Texture samplers
//-----------------------------------------------------------------------------
DECLARE_TEX2D(TEX_REG_6, TX_WATERCOMPUTE_WATERSIM, SMP_CLAMP_LINEAR);
DECLARE_TEX2D(TEX_REG_8, TX_WATERCOMPUTE_TEXTURE, SMP_WRAP_LINEAR);
DECLARE_TEX2D(TEX_REG_9, TX_WATERCOMPUTE_MASK, SMP_WRAP_LINEAR);
DECLARE_TEX2D(TEX_REG_10, TX_WATERCOMPUTE_BB_OPAQUE, SMP_CLAMP_LINEAR_SRGB);

//--------------------------------------------------------------------------------------
// Shader code
//--------------------------------------------------------------------------------------
#ifndef __cplusplus

//--------------------------------------------------------------------------------------
// Structures
struct VS_GRID_INPUT
{
	float4 vGrid : COLOR0;
	// instance data
	float4 vBlockData : BYTEDATA0;
};
struct VS_GRID_OUTPUT
{
	float4 worldPos_w : WORLDPOS_W;
	//float2 projNormal : PROJNORMAL;
};
// Vertex shader
VS_GRID_OUTPUT gridVS(const VS_GRID_INPUT v, out float4 oProjPos : SV_Position) {
	VS_GRID_OUTPUT Out;
	float block_x = v.vBlockData.b * 255.f;
	float block_z = v.vBlockData.g * 255.f;
	float3 worldPos;
	worldPos.x = g_vTerrainPosData.x + block_x * TERRAIN_BLOCK_SIZE;
	worldPos.z = g_vTerrainPosData.y + block_z * TERRAIN_BLOCK_SIZE;
	worldPos.xz += v.vGrid.xz * TERRAIN_BLOCK_SIZE;

	float2 terrainTC = (worldPos.xz - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	worldPos.y = UnpackHeight(sampleLevel2D(TX_TCOMMON_WATERHEIGHTMAP, terrainTC).r);
	
	// Transform the position from world space to homogeneous projection space
	oProjPos = mul(float4(worldPos, 1), g_tmViewProj);
	//{
	//	float4 projPos = oProjPos;		
	//	float3 at = worldPos + baseNormal;
	//	float4 projAt = mul(float4(at, 1), g_tmViewProj);
	//	
	//	Out.projNormal = normalize(projAt.xy / projAt.w - projPos.xy / projPos.w);
	//	Out.projNormal.x = -Out.projNormal.x;

	//	// use up direction for close vertices (or behind camera)
	//	Out.projNormal = lerp(float2(0, 1), Out.projNormal, saturate((projPos.w - 2.f) / 2.f));
	//}
	Out.worldPos_w.xyz = worldPos;
	Out.worldPos_w.w = oProjPos.w;

	return Out;
}//
//----------------------------------------------------------------------------

// Pixel shader
float4 simulationPS(in float2 tc : TEXCOORD0) : SV_Target0
{
	float2 simPosXZ;
	simPosXZ.x = g_vBlocksMinXZ.x + tc.x * g_vBlocksSizeXZ.x;
	simPosXZ.y = g_vBlocksMinXZ.y + tc.y * g_vBlocksSizeXZ.y;

	float2 terrainTC = (simPosXZ - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	//outColor1 = sample2D(TX_WATERCOMPUTE_WATERSIM2, screenTC);
	//return sample2D(TX_WATERCOMPUTE_WATERSIM, screenTC);
	float waterHeight = UnpackHeight(sampleLevel2D(TX_TCOMMON_WATERHEIGHTMAP, terrainTC).r);
	float4 waterMap = sampleLevel2D(TX_TCOMMON_WATERMAP, terrainTC);
	float2 flow = UnpackNormal2(WATER_MAP_FLOW(waterMap));
	float flowSpeed = length(flow);

	float diagW = .85f;
	const float3 dd[9] = {
		float3(-1.f, -1.f, diagW),
		float3(0.f , -1.f, 1.f),
		float3(+1.f, -1.f, diagW),
		float3(-1.f, 0.f   ,1.f),
		float3( 0.f, 0.f   ,1.f),
		float3(+1.f, 0.f   ,1.f),
		float3(-1.f, +1.f, diagW),
		float3(0.f , +1.f, 1.f),
		float3(+1.f, +1.f, diagW),
	};
	float heightOffset = 0;
	float foam = 0;
	float2 disturbance = 0;
	//float2 dynamicFlow = 0;
	{
		float weightSum = 0;
		float weightSumFlow = 0;
		float flowMaxL = 0;
		int i;
		for (i = 0; i < 9; i++) {
			float d = dot(dd[i].xy, flow);
			float w = dd[i].z * lerp(1.f, saturate((-d - .5f) / .25f) * .95f, flowSpeed);			
			float2 waterSimAdjTC = tc + dd[i].xy * g_vRTSizeInv;
			float4 simAdj = sampleLevel2D(TX_WATERCOMPUTE_WATERSIM, waterSimAdjTC);

			// accumulate
			heightOffset += (WATER_SIM_HEIGHTOFFSET(simAdj) - .50196f) * w;
			foam = max(foam, WATER_SIM_DYNAMIC_FOAM(simAdj) * w);
			weightSum += w;

			float2 simFlow = UnpackNormal2(WATER_SIM_DISTURBANCE(simAdj));
			float simFlowL = length(simFlow);
			if (simFlowL > .001f) {
				float wFlow = dd[i].z * simFlowL;
				disturbance += simFlow / simFlowL * wFlow;

				flowMaxL = max(flowMaxL, simFlowL);
				weightSumFlow += wFlow;
			}
		}
		if (weightSumFlow > .001f) {
			disturbance *= flowMaxL / weightSumFlow;
		}

		heightOffset *= .8f;
		heightOffset /= weightSum;

		// only allow dynamic foam with dynamic flow
		//foam *= .95f;
		foam -= 5.f / 255.f;
	}
	
	float baseHeight = UnpackHeight(sampleLevel2D(TX_TCOMMON_HEIGHTMAP, terrainTC).r);
	float tDepth = saturate((waterHeight - baseHeight + .1f) / .2f);
	float tEdge = saturate(tc.x / .05f) * saturate(tc.y / .05f);
	tEdge *= saturate((1.f - tc.x) / .05f) * saturate((1.f - tc.y) / .05f);
	heightOffset *= tEdge;
	//heightOffset *= tDepth; // dont fade out height offset by water depth

	//foam += disturbance * (1.f - saturate(tDepth)) * .1f; // add foam at low depth
	foam *= tEdge;
	//foam *= tOpacity * tEdge;

	//{
		//float foamDepthParam = saturate((baseHeight - waterHeight + 2.f) / 4.f);
		//foamDepthParam *= flowSpeed / .25f;
		//foam = max(foam, foamDepthParam);
	//}
/*
	{
		const float ambientWindSpeed = 0;// 4.f;
		float3 samplePos;
		samplePos.xz = simPosXZ;
		samplePos.y = g_fSceneTime * 16.f;
		float3 noiseTC = samplePos - AMBIENT_WIND_DIRECTION * ambientWindSpeed * g_fSceneTime;

		const float density = .001f;
		float n = sampleLevel3D(TX_TCOMMON_WIND_NOISE, noiseTC * density).r;
		disturbance += max(n - .33f, 0.f) * .066f;
	}
*/
	//disturbance = .2f;
	//disturbance += .05f;

	disturbance *= tDepth * tEdge;
	if (tDepth <= 0) {
		// prevent propagating accross border
		foam = 0;
	}
	{
		float l = length(disturbance);
		// help fading dynamic flow out
		if (l < .25f) {
			disturbance = lerp(disturbance, normalize(flow)*l, .01f);

			const float _t = 2.f / 255.f;
			if (disturbance.x > _t) {
				disturbance.x -= _t;
			} else if (disturbance.x < -_t) {
				disturbance.x += _t;
			} else {
				disturbance.x = 0;
			}
			if (disturbance.y > _t) {
				disturbance.y -= _t;
			} else if (disturbance.y < -_t) {
				disturbance.y += _t;
			} else {
				disturbance.y = 0;
			}
		}
		disturbance *= .9f - length(flow) * .2f;
	}

	float4 waterSim = 0;
	WATER_SIM_HEIGHTOFFSET(waterSim) = heightOffset + .5f;	
	WATER_SIM_DYNAMIC_FOAM(waterSim) = foam;
	WATER_SIM_DISTURBANCE(waterSim) = PackNormal2(disturbance);

	return waterSim;
}//
//--------------------------------------------------------------------------------------
float4 wavesPS(in float2 tc : TEXCOORD0) : SV_Target0
{	
	//return tex2D(g_samTexture0, tc);
#ifdef SHOW_WAVES
	if (!(int(tc.y * 32.f) % 4)) {
		// stripes to visualise direction
		return float4(1,0,0,0);
	}
	return sample2D(TX_WATERCOMPUTE_TEXTURE, tc);
#endif
	float extraScale = 1.5f;
	float2 flow[5] = {
		float2(+.1f, 0) / extraScale,
		float2(-.14f, 0) / extraScale,
		float2(0, +.1f) / extraScale,
		float2(0, -.14f) / extraScale,
		float2(-.16f, -.16f) / extraScale
	};
	float tcScale = .4f;
	float heightDisturbScale = .4f;
	float normalDisturbScale = .4f;

	float4 nm = float4(0, 0, .4f, 0);  
	float w = 0;
	
	const float tFactor = 1.4f;
	for(float i = 0; i < 5; i++) {
		float4 waves = SampleMirrored(TX_WATERCOMPUTE_TEXTURE, tc, 
			tc + flow[i] * g_fSimulationTime / tcScale, tcScale, /*min(tcScale * 10.f, 1.f)*/1.f );
		if (i == 1) {
			float t = saturate(1.1f - waves.w - nm.w);
			nm.rg = lerp(nm.rg, (waves.rg * 2.f - 1.f) * normalDisturbScale, t);
			nm.w = lerp(nm.w, waves.w * heightDisturbScale, t);
		} else {
			nm.rg += (waves.rg * 2.f - 1.f) * normalDisturbScale;
			nm.w += waves.w * heightDisturbScale;
		}

		tcScale *= tFactor;
		heightDisturbScale /= tFactor;
		normalDisturbScale /= tFactor;
	}
	nm.xyz = (normalize(nm.xyz) + 1.f) / 2.f;
	nm.w = (nm.w - .1f);

	//#ifdef _EDITOR
	//	if (g_fWaterDrawMode == 2.f) {
	//		if (!(int(tc.y * 64.f) % 8)) {
	//			// stripes to visualise direction
	//			nm.xyz = float3(1,0,0);
	//		}
	//	}
	//#endif
	return nm;
}

//--------------------------------------------------------------------------------------
float4 causticsPS(in float2 tc : TEXCOORD0) : SV_Target0
{
	//return tex2D(g_samTexture0, t);
	float2 distort = SampleMirrored(TX_WATERCOMPUTE_TEXTURE, tc, tc + float2(.5f, g_fSimulationTime * .1f), .16f, .25f).rg;
	distort += SampleMirrored(TX_WATERCOMPUTE_TEXTURE, tc, tc - float2(0, g_fSimulationTime * .1f), .16f, .25f).rg;
	
	float3 caustics = SampleMirrored(TX_WATERCOMPUTE_TEXTURE, tc, tc + distort.xy * .15f + float2(.1f, -.035f) * g_fSimulationTime, 1.12f, .25f).bbb;
	caustics += SampleMirrored(TX_WATERCOMPUTE_TEXTURE, tc, tc - distort.yx * .15f + float2(-.17f, 0) * g_fSimulationTime, 1.4f, .25f).bbb;
	return float4(caustics,0);
}

//--------------------------------------------------------------------------------------
float4 foamPS(in float2 tc : TEXCOORD0) : SV_Target0
{
	//return tex2D(g_samTexture0, tc);
	//return SampleMirrored( g_samTexture0, tc, tc, .5f, .25f );
	float2 flow[4] = {
		float2(-.06f, -.16f),
		float2(-.03f, +.24f),
		float2(+.02f, +.18f),
		float2(-.08f, -.06f),
	};
	float tcScale = .1f;
	float scale = 1.f;
	float foam = 0;

	const float scale0[4] = (float[4])g_vFoamScale0;
	const float scale1[4] = (float[4])g_vFoamScale1;
	const float weights[4] = (float[4])g_vFoamWeights;
	for(float i = 0; i < 4; i++)
	{
		float s0 = scale0[i];
		float s1 = scale1[i];
		float w = weights[i];

		float4 disturb = sample2D(TX_WATERCOMPUTE_MASK, tc);
		float2 tcSampleBase0 = tc + flow[i] * 9.323f;
		float2 tcSampleBase1 = tc - flow[i] * 7.497f;
		float2 tcSample0 = tcSampleBase0 - (disturb.rg - .50196f) * s0 * 2;
		float2 tcSample1 = tcSampleBase1 - (disturb.rg - .50196f) * s1 * 2;
		float s = lerp(
			SampleMirrored(TX_WATERCOMPUTE_TEXTURE, tc, tcSample1, tcScale, .25f ).r,
			SampleMirrored(TX_WATERCOMPUTE_TEXTURE, tc, tcSample0, tcScale, .25f ).r,
			w);
		s *= scale;

		foam += s * (s * 2.f - 1.f * scale);
		foam = lerp(foam, s, saturate((s - foam) * 1.f));

	//	tcScale *= 1.6f;
	//	scale *= .7f;
	}
	return foam.xxxx;
}

//--------------------------------------------------------------------------------------
// Pixel shader
float4 Sample4DepthsW(float4 uv0, float4 uv1) {
	float4 res = float4(
		sampleLevel2Dex(TX_COMMON_Z, uv0.xy, SMP_CLAMP_POINT).r,
		sampleLevel2Dex(TX_COMMON_Z, uv0.zw, SMP_CLAMP_POINT).r,
		sampleLevel2Dex(TX_COMMON_Z, uv1.xy, SMP_CLAMP_POINT).r,
		sampleLevel2Dex(TX_COMMON_Z, uv1.zw, SMP_CLAMP_POINT).r
	);
	return res;
}
bool4 IntersectsDepthBuffer(float4 z, float4 minZ, float4 maxZ) {
	// TODO: 1. improve thickness check
	// TODO: 2. fix screen side bend
	const float thickness = 1.0;
	//float4 depthScale = min(float4(1.0, 1.0, 1.0, 1.0), z / 150.0);
	//z += 2.5 * depthScale + thickness - 0.25;
	return bool4(
		(maxZ.x >= z.x) && (minZ.x - thickness <= z.x),
		(maxZ.y >= z.y) && (minZ.y - thickness <= z.y),
		(maxZ.z >= z.z) && (minZ.z - thickness <= z.z),
		(maxZ.w >= z.w) && (minZ.w - thickness <= z.w));
}
float ScreenEdgeMaskY(float2 uv) {
	return pow2(saturate(12.f * uv.y * (1.f - uv.y) + 0.5f));
}
// Project point to [-1;1] projection space
float2 ProjectPoint(float3 viewSpacePos, in float2 vCameraFovData) {
	float2 res = viewSpacePos.xy / viewSpacePos.z;
	return res * vCameraFovData;
}
float4 RayMarchScreenVec(in float2 vCameraFovData, in float3 ray, in float3 viewPos, in float noiseOffset)
{
	const float maxViewDist = 64.f; // dont reflect sky
	const float zCutoff = 1024.f;

	float3 startPoint = viewPos;
	float3 endPoint = viewPos + normalize(ray) * maxViewDist;
	float4 H0 = float4(ProjectPoint(startPoint, vCameraFovData).xy * float2(0.5, -0.5) + 0.5, startPoint.z, startPoint.z);
	float4 H1 = float4(ProjectPoint(endPoint, vCameraFovData).xy * float2(0.5, -0.5) + 0.5, endPoint.z, endPoint.z);
	float k0 = 1.0 / H0.w;
	float k1 = 1.0 / H1.w;
	float3 Q0 = startPoint * k0;
	float3 Q1 = endPoint * k1;

	float2 P0 = H0.xy;
	float2 P1 = H1.xy;

	float2 delta = (P1 - P0);
	bool permute = false;
	if (abs(delta.x) < abs(delta.y)) {
		permute = true;
		delta = delta.yx;
		P0 = P0.yx;
		P1 = P1.yx;
	}

	float stepDir = sign(delta.x) * (permute ? g_vRTSizeInv.y : g_vRTSizeInv.x) / 16;
	float invdx = stepDir / delta.x;

	float3 dQ = (Q1 - Q0) * invdx;
	float dk = (k1 - k0) * invdx;
	float2 dP = float2(stepDir, delta.y * invdx);

	float strideScale = 1.0 - min(1.0, startPoint.z / zCutoff);
	const float maxStride = 48.0;
	float stride = 1 + strideScale * (maxStride - 1.0);
	dP *= stride;
	dQ *= stride;
	dk *= stride;

	P0 += dP * (noiseOffset * 0.99 + 0.01);
	Q0 += dQ * (noiseOffset * 0.99 + 0.01);
	k0 += dk * (noiseOffset * 0.99 + 0.01);

	float4 PQk = float4(P0, Q0.z, k0);
	float4 dPQk = float4(dP, dQ.z, dk);

	float end = P1.x * stepDir;
	float rayZMin = viewPos.z;

	int stepCount = 0;
	int numSteps = 64;
	float w = 0.0;
	for (; PQk.x * stepDir <= end && stepCount < numSteps; stepCount += 4.0) {
		float4 sampleUV0 = PQk.xyxy + dPQk.xyxy * float4(0, 0, 1, 1);
		float4 sampleUV1 = PQk.xyxy + dPQk.xyxy * float4(2, 2, 3, 3);
		bool4 intoScreen = float4(sampleUV0.xz, sampleUV1.xz) * stepDir.xxxx <= end.xxxx;
		if (permute) {
			sampleUV0 = sampleUV0.yxwz;
			sampleUV1 = sampleUV1.yxwz;
		}
		float4 sampleDepth = Sample4DepthsW(sampleUV0, sampleUV1);
		float4 sampleZMax = float4(1.0, 1.0, 1.0, 1.0) / (dPQk.wwww * float4(0.5, 1.5, 2.5, 3.5) + PQk.wwww);

		float4 sampleZMin = float4(rayZMin, sampleZMax.xyz);
		rayZMin = sampleZMax.w;

		bool4 intersectZ = IntersectsDepthBuffer(sampleDepth, sampleZMin, sampleZMax);
		intersectZ.x = intoScreen.x && intersectZ.x;
		intersectZ.y = intoScreen.y && intersectZ.y;
		intersectZ.z = intoScreen.z && intersectZ.z;
		intersectZ.w = intoScreen.w && intersectZ.w;

		// there is no pk versions of cndmask but the  reduction in registers is useful here
		float4 tNum = intersectZ ? float4(1, 2, 3, 4) : float4(10.0f, 10.0f, 10.0f, 10.0f);
		float t = min(min(tNum.x, tNum.y), min(tNum.z, tNum.w));
		if (t < 10.f) {
			PQk += t * dPQk;
			w = 1.0f;
			break;
		}
		PQk += 4.0 * dPQk;
	}
	float2 tc = (permute ? PQk.yx : PQk.xy);
	w *= ScreenEdgeMaskY(tc.xy);

	return float4(tc.xy, PQk.w, w);
}//
//--------------------------------------------------------------------------------------

//--------------------------------------------------------------------------------------
// Pixel shader
float4 reflectionsPS(const VS_GRID_OUTPUT v, in float4 vScreenPos : SV_Position) : SV_Target0
{
	/*
	{
		float2 terrainTC = (v.worldPos_w.xz - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
		float waterHeight = UnpackHeight(sampleLevel2D(TX_TCOMMON_WATERHEIGHTMAP, terrainTC).r);
		float waterDepth = waterHeight - UnpackHeight(sampleLevel2D(TX_TCOMMON_HEIGHTMAP, terrainTC).r);
		if (waterDepth <= WATER_CLIP_DEPTH) {
			// clip to prevent overwriting actual reflections (and maybe save performance?)
			clip(-1);
		}
	}
	*/

	//clip(v.baseNormal_alpha.a - (1.f - 1.f/255.f));	
	float3 baseNormal = _UP;// UnpackXZNormal(sampleLevel2D(TX_WATERCOMPUTE_WATERNORMALS, partTC).rg);
	float3 dirToEye = normalize(g_vEyePos - v.worldPos_w.xyz);
	//float3 reflColor;
	//{
	//	float3 reflDir = normalize(g_vViewDir.xyz * float3(1.f, 0, 1.f));
	//	reflDir = -normalize(float3(
	//		reflDir.x,
	//		-1.f,
	//		reflDir.z));
	//	float3 reflectVec = reflect(reflDir, baseNormal);
	//	reflColor = sampleLevelCube(TX_COMMON_GGXREFLCUBE, -reflectVec).rgb;
	//}

	// specular color
	//{
	//	float3 specDir = normalize(g_vSunDir * float3(1.f, .4f, 1.f));
	//	float specularPower = lerp(8.f, 256.f, saturate((-specDir.y - .15f) / .3f));

	//	float3 specHalfVector = normalize(dirToEye - specDir);
	//	float specularFactor =
	//		pow(max(0, dot(baseNormal, specHalfVector)), specularPower) * specularPower / 256.f;

	//	skyColor += g_vSunColor * specularFactor;
	//}
	//#ifdef QUALITY_HIGHEST	
	float4 reflColor;
	{		
		float3 reflDir = reflect(-dirToEye, baseNormal);
		/*
		// quat res texture
		float2 screenTC = vScreenPos.xy * g_vRTSizeInv;	

		float3 planeNormal = v.baseNormal;
		float2 projNormal = float2(0, 1);//normalize(v.projNormal);
		float4 plane = float4(planeNormal, -dot(planeNormal, v.worldPos_w.xyz));

		float dp = dot(dirToEye, planeNormal);
		int numSamples = (int)lerp(64.f, 1.f, saturate((dp - .5f) / .5f));
		#ifdef SIMPLIFIED_SHADING
			numSamples = numSamples * 2 / 3;
		#endif

		float depthRoot = 0.f;
		float iRefl = numSamples;
		int i;
		for (i = 2; i < numSamples; i++) {
			float2 tc = screenTC - projNormal * i * g_vRTSizeInv;
			float screenDepth = sampleLevel2D(TX_COMMON_Z, tc).r;
			//if (screenDepth >= g_vColor0.w) {
			//	break; // sky
			//}

			float3 frustumViewDir = lerp(
				lerp(g_frustumDirs[0].xyz, g_frustumDirs[1].xyz, 1 - tc.y),
				lerp(g_frustumDirs[3].xyz, g_frustumDirs[2].xyz, 1 - tc.y),
				tc.x);
			float depthCorrection = 1.f / dot(frustumViewDir, g_vViewDir.xyz);
			float3 samplePos = g_vEyePos + frustumViewDir * screenDepth * depthCorrection;

			const float thresholdD = 1.f;
			float stepD = .002f + saturate((dp - .5f) / .5f) * .006f;
			float d = dot(plane, float4(samplePos, 1.f)) - (i - 2) * stepD;
			if (d > 0 && d < thresholdD && screenDepth + 1.f - d / 16.f > v.worldPos_w.w) {
				depthRoot = screenDepth;
				iRefl = i - d / (thresholdD * thresholdD);
				break;
			}
		}
		float2 tcRefl = screenTC - projNormal * iRefl * 2.f * g_vRTSizeInv;
		float screenDepthRefl = sampleLevel2D(TX_COMMON_Z, tcRefl).r;

		float t = (numSamples - iRefl) / (numSamples - 1.f);
		t = saturate(t / .8f);
		t *= saturate(tcRefl.y / .02f);

		// too far
		t *= 1.f - saturate((screenDepthRefl - depthRoot - depthRoot * .05f) / (depthRoot * .2f));

		// too close
		t *= 1.f - saturate((depthRoot - screenDepthRefl - 16.f) / 8.f);
		//if (screenDepthRefl >= g_vColor0.w) {
		//	t = 0; // sky
		//}

		// fade by distance
		t *= 1.f - saturate((depthRoot - v.worldPos_w.w - 64.f) / 256.f);

		float3 refl = lerp(
			skyColor,
			sample2D(TX_WATERCOMPUTE_BB_OPAQUE, tcRefl).rgb,
			t);	
		*/	
				
		float3 viewPos = (mul(float4(v.worldPos_w.xyz, 1), g_tmView)).xyz;
		//float3 viewNorm = mul(v.baseNormal, (float3x3)g_tmView);

		//float3 viewVec = mul(-dirToEye, (float3x3)g_tmView);
		//float3 reflView = reflect(viewVec, viewNorm);		
		float3 reflView = mul(reflDir, (float3x3)g_tmView);

		//float4 ss_res;
		float4 ss_res = RayMarchScreenVec(g_vCameraFovData, reflView, viewPos, 0.5);
		{
			float3 frustumViewDir = lerp(
				lerp(g_frustumDirs[0].xyz, g_frustumDirs[1].xyz, 1 - ss_res.y),
				lerp(g_frustumDirs[3].xyz, g_frustumDirs[2].xyz, 1 - ss_res.y),
				ss_res.x);
			float depthCorrection = 1.f / dot(frustumViewDir, g_vViewDir.xyz);
			float3 samplePos = g_vEyePos + frustumViewDir * (1 / ss_res.z) * depthCorrection;

			float4 plane = float4(baseNormal, -dot(baseNormal, v.worldPos_w.xyz));
			float d = dot(plane, float4(samplePos, 1.f));
			
			// prevent sampling from below water surfaces (happens when looking down)
			ss_res.a *= saturate(d / .05f);
		}
		//reflColor = lerp(reflColor, sampleLevel2D(TX_WATERCOMPUTE_BB_OPAQUE, ss_res.xy).rgb, ss_res.a);
		reflColor.rgb = sampleLevel2D(TX_WATERCOMPUTE_BB_OPAQUE, ss_res.xy).rgb;
		reflColor.a = ss_res.a;

		//for (i = 0; i < g_fNumFlares; i++) {
		//	float3 posToFlare = normalize(g_aFlaresPos[i] - v.worldPos_w.xyz);
		//	// stretch along y
		//	posToFlare.y = lerp(posToFlare.y, reflDir.y, .5f);
		//	posToFlare = normalize(posToFlare);

		//	float specularFactor = pow(max(0, dot(reflDir, posToFlare)), lerp(256.f, 1.f, max(reflDir.y, 0.f)));
		//	refl += g_aFlaresColors[i].rgb * specularFactor * 2.f;
		//	reflMult += g_aFlaresColors[i].w * specularFactor * WATER_REFLECTIONS_MULTIPLIER;
		//}
		
	}
	//#endif

	//float reflMult = 1;
	//reflMult = max(reflMult, reflColor.r);
	//reflMult = max(reflMult, reflColor.g);
	//reflMult = max(reflMult, reflColor.b);
	//reflColor /= reflMult;
	//return float4(reflColor, reflMult / WATER_REFLECTIONS_MULTIPLIER);
	return reflColor;
}//
#endif //__cplusplus

//--------------------------------------------------------------------------------------
// Techniques
//--------------------------------------------------------------------------------------

DECLARE_TECHNIQUE(Simulation, passThroughTexVS, simulationPS);
DECLARE_TECHNIQUE(Waves, passThroughTexVS, wavesPS);
DECLARE_TECHNIQUE(Caustics, passThroughTexVS, causticsPS);
DECLARE_TECHNIQUE(Foam, passThroughTexVS, foamPS);
DECLARE_TECHNIQUE(Reflections, gridVS, reflectionsPS);

//EOF