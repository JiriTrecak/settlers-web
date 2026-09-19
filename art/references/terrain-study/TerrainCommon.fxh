//--------------------------------------------------------------------------------------
// File:		TerrainCommon.fxh
// Description:	
// Date:		7/08/10 4:47 PM
//--------------------------------------------------------------------------------------
#ifndef _TERRAIN_COMMON_FXH
#define _TERRAIN_COMMON_FXH

//-----------------------------------------------------------------------------
// Global variables
//-----------------------------------------------------------------------------
DECLARE_TEX2D(TEX_COMMON_REG_8, TX_TCOMMON_SNOW_OVERLAY_AR, SMP_WRAP_ANISO_SRGB);
DECLARE_TEX2D(TEX_COMMON_REG_9, TX_TCOMMON_SNOW_OVERLAY_NH, SMP_WRAP_ANISO);
DECLARE_TEX3D_EX(TEX_COMMON_REG_10, TX_TCOMMON_WIND_NOISE, SMP_WRAP_LINEAR, USAGE_VS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_11, TX_TCOMMON_HEIGHTMAP, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_12, TX_TCOMMON_CUTMAP, SMP_CLAMP_POINT, USAGE_VS | USAGE_DS | USAGE_PS);
//DECLARE_TEX2D_EX(TEX_COMMON_REG_12, TX_TCOMMON_HEIGHTMAPBASE, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_13, TX_TCOMMON_WATERMAP, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_14, TX_TCOMMON_WATERHEIGHTMAP, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_15, TX_TCOMMON_LIGHTMAPOCCLUSION, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
//DECLARE_TEX2D_EX(TEX_COMMON_REG_16, TX_TCOMMON_TRAMPLEMAP, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_16, TX_TCOMMON_UNDERLAYMASK, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX3D_EX(TEX_COMMON_REG_17, TX_TCOMMON_ENVIRONMENT_ODF, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
//DECLARE_TEX2D_EX(TEX_COMMON_REG_17, TX_TCOMMON_CORPSEMAP, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
//DECLARE_TEX2D_EX(TEX_COMMON_REG_16, TX_TCOMMON_ROADSMAP, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_18, TX_TCOMMON_LIGHTMAPBOUNCE, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_19, TX_TCOMMON_GROUNDMAP, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_20, TX_TCOMMON_WATERSIM, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_21, TX_TCOMMON_FOLIAGE_BEND, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_22, TX_TCOMMON_PARTICLES_SHADOWS, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX3D_EX(TEX_COMMON_REG_23, TX_TCOMMON_WIND_SIMULATION, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_PS);
//DECLARE_TEX2D(TEX_COMMON_REG_24, TX_TCOMMON_ROAD_AR, SMP_WRAP_ANISO_SRGB);
//DECLARE_TEX2D(TEX_COMMON_REG_25, TX_TCOMMON_ROAD_NH, SMP_WRAP_ANISO);
DECLARE_TEX2D(TEX_COMMON_REG_24, TX_TCOMMON_CHUNKS_OVERLAY, SMP_WRAP_LINEAR);
DECLARE_TEX2D(TEX_COMMON_REG_25, TX_TCOMMON_BURN_MASK, SMP_WRAP_LINEAR);
DECLARE_TEX2D(TEX_COMMON_REG_26, TX_TCOMMON_DECALS_BLOOD, SMP_WRAP_LINEAR_SRGB);
DECLARE_TEX2D(TEX_COMMON_REG_27, TX_TCOMMON_MICRO_NOISE, SMP_WRAP_LINEAR);
DECLARE_TEX2D(TEX_COMMON_REG_28, TX_TCOMMON_ALPHA_DITHER, SMP_WRAP_POINT);
DECLARE_TEX2D_EX(TEX_COMMON_REG_29, TX_TCOMMON_MACRO_COLOR, SMP_WRAP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_30, TX_TCOMMON_CLOAKING_A, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX(TEX_COMMON_REG_31, TX_TCOMMON_CLOAKING_B, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);

CONST_BUFFER_BEGIN_COMMON(CB_SHARED_GLOBAL)
	DECLARE_FLOAT(g_fCloakingBlendT, EC_TCOMMON_CLOAKING_BLENDT)
	DECLARE_FLOAT(g_fIsUseGroundmap, EC_TCOMMON_IS_USE_GROUNDMAP)
	DECLARE_FLOAT(g_fIsWritingBloom, EC_TCOMMON_IS_WRITING_BLOOM)	
	DECLARE_FLOAT4(g_vTerrainPosData, EC_TCOMMON_TERRAIN_POSDATA)
	DECLARE_FLOAT4(g_vVisiblePosData, EC_TCOMMON_VISIBLE_POSDATA)
	DECLARE_FLOAT4X4(g_tmViewerViewProj, EC_TCOMMON_VIEWERVIEWPROJ)
	DECLARE_FLOAT3(g_vWindSimulationCenter, EC_TCOMMON_WIND_SIMULATION_CENTER)
	DECLARE_FLOAT3(g_vEnvironmentOdfMin, EC_TCOMMON_ENVIRONMENT_ODF_MIN)
	DECLARE_FLOAT3(g_vEnvironmentOdfSizeInv, EC_TCOMMON_ENVIRONMENT_ODF_SIZEINV)
	DECLARE_FLOAT4X3(g_tmEnvironmentOdfTransformInv, EC_TCOMMON_ENVIRONMENT_ODF_TRANSFORMINV)

	#ifdef _EDITOR
		DECLARE_FLOAT(g_fEnablePlantsWind, EC_TCOMMON_ENABLE_PLANTS_WIND)
	#endif
CONST_BUFFER_END;

//--------------------------------------------------------------------------------------
// Shader code
//--------------------------------------------------------------------------------------
#ifndef __cplusplus

#define WATER_SIM_HEIGHTOFFSET(x)	x.r
#define WATER_SIM_DISTURBANCE(x)	x.gb	
#define WATER_SIM_DYNAMIC_FOAM(x)	x.a	

#define WATER_MAP_FLOW(x)		x.rg
#define WATER_MAP_FOAM(x)		x.b
//#define WATER_MAP_OPACITY(x)	x.a	

//static const float WATER_REFLECTIONS_MULTIPLIER = 8.f;
static const float SSAO_FACTOR_GRASS = .2f;
static const float SSAO_FACTOR_PLANT = .8f;

struct VS_BLOCK_INSTANCE_INPUT {
	float4 vQuad : COLOR0;
	float4 vBlockData0 : DATA0;
};
float GetFogSSAOFactor(in float4 fogColor) {
	return pow(saturate(1.f - GetRGBIntensity(fogColor.rgb) * fogColor.a * 10.f), 2.f);
}//
//--------------------------------------------------------------------------------------
float GetLightingSSAOFactor(in float fogFactor) {
	return saturate(fogFactor * .5f/* + s_fAmbientSpecularIntensityOut * 4.f*/) * (1.f - s_fDirectionalIntensityOut);
}//
//--------------------------------------------------------------------------------------
float GetCloakingAt(in float2 worldPosXZ) {
#ifndef _EDITOR	
	float2 terrainTC = (worldPosXZ - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	return lerp(
		sampleLevel2D(TX_TCOMMON_CLOAKING_A, terrainTC).r,
		sampleLevel2D(TX_TCOMMON_CLOAKING_B, terrainTC).r, g_fCloakingBlendT);
#else
	return 1;
#endif
}//
//--------------------------------------------------------------------------------------
float GetUnderlaysMaskAt(in float2 worldPosXZ) {
	float2 terrainTC = (worldPosXZ - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	return sampleLevel2D(TX_TCOMMON_UNDERLAYMASK, float2(terrainTC.x, 1.f - terrainTC.y)).r;
}//
//--------------------------------------------------------------------------------------

void ClipByTerrainCutmap(float2 screenTC, float4 projPos) {
#ifndef _EDITOR
	const float threshold = 2.f;
	float clipDepth = sampleLevel2D(TX_TCOMMON_CUTMAP, screenTC).r;

	if (projPos.z / (projPos.w + threshold) < clipDepth) {
		clip(-1);
	}
#endif
}//
//--------------------------------------------------------------------------------------

void ClipByTerrainCutmap(float2 screenTC, float3 worldPos) {
	ClipByTerrainCutmap(screenTC, mul(float4(worldPos, 1.f), g_tmViewProj));
}//
//--------------------------------------------------------------------------------------

//--------------------------------------------------------------------------------------
// Functions
static const int NUM_DISCRETE_DIRECTIONS = 32;
static const int NUM_DISCRETE_SPEEDS = 10;
void DiscretizeWaves(in float2 flowDir, in float flowSpeed,
	out float2 dir1, out float2 dir2, out float angT,
	out float lin0, out float lin1, out float linT)
{
	{
		const float segD = 2.f * _PI / NUM_DISCRETE_DIRECTIONS;

		float flowAngle = atan2(flowDir.y, flowDir.x);
		int seg = int((flowAngle + _PI) / segD);

		float seg0 = seg * segD - _PI;
		float seg1 = (seg + 1) * segD - _PI;

		sincos(seg0, dir1.y, dir1.x);
		sincos(seg1, dir2.y, dir2.x);
		angT = saturate((flowAngle - seg0) / segD);
	}
	{
		const float linD = 1.f / NUM_DISCRETE_SPEEDS;

		int seg = int(flowSpeed / linD);
		lin0 = seg * linD;
		lin1 = (seg + 1) * linD;
		linT = saturate((flowSpeed - lin0) / linD);
	}
}//
//--------------------------------------------------------------------------------------

void ComputeDefaultQuadConstant(out HS_DEFAULT_QUAD_CONSTANT_OUTPUT data, 
	in float3 v0, in float3 v1, in float3 v2, in float3 v3, in float tessDistStart, in float tessDistInterval,
	in uniform bool isLinear = false, in float tessFactor = 1.f) 
{
	float3 centers[4] = {
		(v3 + v0) / 2.f,
		(v0 + v1) / 2.f,
		(v1 + v2) / 2.f,
		(v2 + v3) / 2.f
	};
	int i;
	[unroll]
	for (i = 0; i < 4; i++) {
		float distToCamera = length(centers[i] - g_vEyePos);
		float tDist = saturate((distToCamera - tessDistStart) / tessDistInterval);
		// max tess factor is 64
		if (isLinear) {
			data.Edges[i] = pow(2, (1.f - tDist) * tessFactor);
		} else {
			data.Edges[i] = pow(2, -log2(tDist) * tessFactor);
		}
	}
	data.Inside[0] = max(data.Edges[1], data.Edges[3]);
	data.Inside[1] = max(data.Edges[0], data.Edges[2]);

	//data.Edges[0] = 1;
	//data.Edges[1] = 1;
	//data.Edges[2] = 1;
	//data.Edges[3] = 1;

	//data.Inside[0] = 1;
	//data.Inside[1] = 1;
}//
//--------------------------------------------------------------------------------------
float PackLightMapOcclusionOffset(float offset) {
	return saturate(offset / 8.f);
}
float UnpackLightMapOcclusionOffset(float alpha) {
	return alpha * 8.f;
}
float UnpackHeight(in float height01) {
	return height01 * MAX_HEIGHTMAP_VALUE;
}
float2 GetTerrainHeightmapTexCoord(in float2 worldPosXZ) {
	// heightmap is pervertex
	const float texelSizeWorld = TERRAIN_BLOCK_SIZE / (TERRAIN_BLOCK_HEIGHTMAP_SIZE - 1);

	float2 vHeightmapSize = 1.f / g_vTerrainPosData.zw;
	vHeightmapSize += texelSizeWorld.xx;

	return (worldPosXZ - g_vTerrainPosData.xy + texelSizeWorld.xx * .5f) / vHeightmapSize;
}//
//--------------------------------------------------------------------------------------
float GetTerrainHeight(in float2 worldPosXZ) {
	float2 texCoord = GetTerrainHeightmapTexCoord(worldPosXZ);
	return UnpackHeight(sampleLevel2D(TX_TCOMMON_HEIGHTMAP, texCoord).r);
}//
//--------------------------------------------------------------------------------------
//float GetTerrainBaseHeight(in float2 worldPosXZ) {
//	float2 texCoord = GetTerrainHeightmapTexCoord(worldPosXZ);
//	return UnpackHeight(sampleLevel2D(TX_TCOMMON_HEIGHTMAPBASE, texCoord).r);
//}//
////--------------------------------------------------------------------------------------
float3 GetTerrainNormal(in float2 worldPosXZ) {
	const float du = TERRAIN_BLOCK_SIZE / (float)TERRAIN_BLOCK_HEIGHTMAP_SIZE * .5f;
	const float dv = TERRAIN_BLOCK_SIZE / (float)TERRAIN_BLOCK_HEIGHTMAP_SIZE * .5f;

	float2 numBlocks = 1.f / (g_vTerrainPosData.zw * TERRAIN_BLOCK_SIZE);
	float2 texelSize = 1.f / (numBlocks * (TERRAIN_BLOCK_HEIGHTMAP_SIZE - 1.f) + 1.f);

	float2 texCoord = GetTerrainHeightmapTexCoord(worldPosXZ);
	return ConstructHeightmapNormal(
		UnpackHeight(sampleLevel2D(TX_TCOMMON_HEIGHTMAP, texCoord - texelSize * .5f).r),
		UnpackHeight(sampleLevel2D(TX_TCOMMON_HEIGHTMAP, texCoord + float2(texelSize.x, -texelSize.y) * .5f).r),
		UnpackHeight(sampleLevel2D(TX_TCOMMON_HEIGHTMAP, texCoord + float2(-texelSize.x, texelSize.y) * .5f).r), du, dv);
}//
//--------------------------------------------------------------------------------------
float4 ComputeTerrainFog(in float3 worldPos) {
	float baseHeight = 0;// GetTerrainBaseHeight(worldPos.xz);
	float4 fog = ComputeFog(worldPos, baseHeight);

	float cloaking = GetCloakingAt(worldPos.xz);
	fog.a *= saturate(cloaking / .5f);

	return fog;
}//
//--------------------------------------------------------------------------------------

float GetWaterDepth(in float3 worldPos) {
#ifdef _EDITOR
	return 0;
#else
	float2 terrainTC = (worldPos.xz - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	float waterHeight = 
		UnpackHeight(sampleLevel2D(TX_TCOMMON_WATERHEIGHTMAP, terrainTC).r);
	return waterHeight - worldPos.y;
#endif
}//
//--------------------------------------------------------------------------------------

float GetSpecularMask(in float waterDepth) {
#ifdef _EDITOR
	return 1.f;
#else
	float d = -waterDepth + .25f;
	return saturate(d / .25f);
#endif
}//
//--------------------------------------------------------------------------------------

float GetWetnessAlbedoMult(float wetness, uniform bool isVertexShader = false) {
	const float albedoWetnessMult = 1.4f;
	const float minAlbedoMult = isVertexShader ? .9f : .6f;
	return max(saturate((1.f - wetness * albedoWetnessMult)), minAlbedoMult);
}//
//--------------------------------------------------------------------------------------
float ApplyDefaultWetness(inout SURFACE_DESC surface, uniform bool isVertexShader = false) {
#ifndef _EDITOR
	//const float roughnessWetnessMult = 1.4f;
	//const float metalnessWetnessAdd = .4f;
	float noise = sample2D(TX_TCOMMON_MICRO_NOISE, surface.worldPos.xz * .05f).a;	
	float waterDepth = GetWaterDepth(surface.worldPos);
	waterDepth += (noise - .5f) * .5f;
	float waterMask = 1.f - saturate((-waterDepth + .5f) / .75f);

	surface.albedo *= GetWetnessAlbedoMult(waterMask, isVertexShader);
	//surface.roughness /= 1.f + waterMask * roughnessWetnessMult;
	//surface.metalness = min(surface.metalness + waterMask * metalnessWetnessAdd * (1 - surface.metalness), 1.f);
	return waterMask;
#else
	return 0;
#endif	
}//
//--------------------------------------------------------------------------------------

float4 GetLightMapOcclusionAt(in float3 worldPos) {
	float2 lightMapTC = (worldPos.xz - g_vVisiblePosData.xy) * g_vVisiblePosData.zw;
	if (max(abs(lightMapTC.x - .5f), abs(lightMapTC.y - .5f)) >= .5f) {
		return float4(1, 1, 1, 0);
	} else {
		float4 lightMapOcclusion = sampleLevel2D(TX_TCOMMON_LIGHTMAPOCCLUSION, lightMapTC);
		//s_fOcclusionLevel0 = lightMap.r;
		return lightMapOcclusion;
	}
}//
//--------------------------------------------------------------------------------------

//void GetLightMapLightingAt(in float3 worldPos, out float4 lightingA, out float4 lightingB) {
//	float2 lightMapTC = (worldPos.xz - g_vLightMapNearPosData.xy) * g_vLightMapNearPosData.zw;
//	lightingA = sampleLevel2D(TX_TCOMMON_LIGHTMAPLIGHTING_NEARA, lightMapTC);
//	lightingB = sampleLevel2D(TX_TCOMMON_LIGHTMAPLIGHTING_NEARB, lightMapTC);
//
//	if (max(abs(lightMapTC.x - .5f), abs(lightMapTC.y - .5f)) >= .5f) {
//		lightMapTC = (worldPos.xz - g_vLightMapFarPosData.xy) * g_vLightMapFarPosData.zw;
//		lightingA = sampleLevel2D(TX_TCOMMON_LIGHTMAPLIGHTING_FARA, lightMapTC);
//		lightingB = sampleLevel2D(TX_TCOMMON_LIGHTMAPLIGHTING_FARB, lightMapTC);
//
//		float t = length(worldPos.xz - g_vEyePos.xz) * (g_vLightMapFarPosData.z * 2.f);
//		lightingA = lerp(lightingA, 0.f, saturate((t - .9f) / .1f)); // fade out
//		lightingB = lerp(lightingB, 0.f, saturate((t - .9f) / .1f)); // fade out
//		//[branch]
//		//if (max(abs(lightMapTC.x - .5f), abs(lightMapTC.y - .5f)) >= .5f) {
//		//	// dont sample static lightmap because its big
//		//	lightMap = sampleLevel2D(TX_TCOMMON_LIGHTMAP_STATIC, (worldPos.xz - g_vTerrainPosData.xy) * g_vTerrainPosData.zw, 0);
//		//}
//	}
//}//
////--------------------------------------------------------------------------------------

float ComputeLightMapOcclusion(float4 lightMap, float3 worldPos, float useLevel0) {
	float terrainHeight = GetTerrainHeight(worldPos.xz);
	float height0 = terrainHeight + UnpackLightMapOcclusionOffset(lightMap.a);
	float d = worldPos.y - height0;

#ifdef FORCE_LIGHTMAP_OCCLUSION_LEVEL0
	{
		// ignore useLevel0
		float t0 = saturate(d / TERRAIN_OCCLUSION_HEIGHT_LEVEL0);
		float occlusion = lerp(lightMap.r, lightMap.g, t0);
		return occlusion;
	}
#else
	{
		float t0 = saturate(d / TERRAIN_OCCLUSION_HEIGHT_LEVEL0 + 1.f - useLevel0);
		float occlusion = lerp(lightMap.r, lightMap.g, t0);

		float t1 = saturate((d - TERRAIN_OCCLUSION_HEIGHT_LEVEL0) / (TERRAIN_OCCLUSION_HEIGHT_LEVEL1 - TERRAIN_OCCLUSION_HEIGHT_LEVEL0));
		occlusion = lerp(occlusion, lightMap.b, t1);

		float t2 = saturate((d - TERRAIN_OCCLUSION_HEIGHT_LEVEL1) / (TERRAIN_OCCLUSION_HEIGHT_LEVEL2 - TERRAIN_OCCLUSION_HEIGHT_LEVEL1));
		occlusion = lerp(occlusion, 1.f, t2);

		#ifdef ADD_OCCLUSION_IF_BELOW_TERRAIN
			//const float d = 8.f;
			//occlusion *= saturate((worldPos.y - terrainHeight) / d + 1.f);
			const float d = 6.f;
			occlusion *= 1.f / exp(max(terrainHeight - worldPos.y, 0) / 6.f);
		#endif
		return occlusion;
	}
#endif
}//
//--------------------------------------------------------------------------------------

float ComputeOcclusionDF(in float3 worldPos, in _texture3D texODF,
	in float4x3 tmOdfTransformInv, in float3 odfMin, in float3 odfSizeInv)
{
	float3 localPos = mul(float4(worldPos, 1), tmOdfTransformInv).xyz;

	const float3 boffset = _UP;
	float dfo = 1.f;
	{
		float3 samplePos = localPos + mul(boffset * 1.f, (float3x3)tmOdfTransformInv);
		float3 dfTC = (samplePos - odfMin) * odfSizeInv;
		// change y and z
		dfo = sampleLevel3D(texODF, dfTC.xzy).r;
	}
	const float3 soffset[4] = {
		float3(-1.f, 2.f, -1.f),
		float3(+1.f, 2.f, -1.f),
		float3(+1.f, 2.f, +1.f),
		float3(-1.f, 2.f, +1.f),
	};
	float dfoMax = dfo;
	int i;
	for (i = 0; i < 4; i++) {
		float3 samplePos = localPos + mul(soffset[i] * .5f, (float3x3)tmOdfTransformInv);
		float3 dfTC = (samplePos - odfMin) * odfSizeInv;
		// change y and z
		dfoMax = max(dfoMax, sampleLevel3D(texODF, dfTC.xzy).r);
	}
	//const float dfMaxFactor = 1.f; // above 1 additionally reduces occlusion (lightmap) at top
	//dfo += max(dfoMax - dfo, 0) * dfMaxFactor;

	//const float minOcclusion = .4f;
	//dfo = max(dfo, minOcclusion);

	return dfo;
}//
//--------------------------------------------------------------------------------------

//static float s_fOcclusionLevel0 = 1;
float GetDefaultOcclusion(in float3 worldPos, in float useLevel0) {
#ifdef USE_ENVIRONMENT_ODF
	/*float3 localPos = mul(float4(worldPos, 1), g_tmEnvironmentOdfTransformInv).xyz;

	float3 dfTC = (localPos - g_vEnvironmentOdfMin) * g_vEnvironmentOdfSizeInv;
	return sampleLevel3D(TX_TCOMMON_ENVIRONMENT_ODF, dfTC.xzy).r;*/
	
	float dfo = ComputeOcclusionDF(worldPos, 
		TX_TCOMMON_ENVIRONMENT_ODF, g_tmEnvironmentOdfTransformInv, g_vEnvironmentOdfMin, g_vEnvironmentOdfSizeInv);
	
	// additional sample above
	dfo = max(dfo, ComputeOcclusionDF(worldPos + float3(0, 1.f, 0), 
		TX_TCOMMON_ENVIRONMENT_ODF, g_tmEnvironmentOdfTransformInv, g_vEnvironmentOdfMin, g_vEnvironmentOdfSizeInv));	
	return dfo;
#else
	float4 lightMapOcclusion = GetLightMapOcclusionAt(worldPos);
	return ComputeLightMapOcclusion(lightMapOcclusion, worldPos, useLevel0);
#endif
}//
//--------------------------------------------------------------------------------------

void ApplyDefaultOcclusion(inout SURFACE_DESC surface) {
	// if backside lighting is used, use level 0 occlusion
	// otherwise we dont want object on the ground to occlude itself	
	surface.occlusion *= GetDefaultOcclusion(surface.worldPos, surface.backside);
}//
//--------------------------------------------------------------------------------------

float GetParticlesShadow(in float3 worldPos) {
	float4 particlesShadowsPos = mul(float4(worldPos, 1.f), g_tmSMViewProj);
	float2 tc = particlesShadowsPos.xy / particlesShadowsPos.w;
	//if (tcShadows.x <= 0 || tcShadows.x >= 1.f || tcShadows.y <= 0 || tcShadows.y >= 1.f) {
	//	return float4(1, 0, 0, 0);
	//}
	float particlesShadow = sampleLevel2D(TX_TCOMMON_PARTICLES_SHADOWS, tc).r;
	#ifndef FORCE_LIGHTMAP_OCCLUSION_LEVEL0
		float d = worldPos.y - GetTerrainHeight(worldPos.xz);
		particlesShadow = lerp(particlesShadow, 1.f, saturate((d - .5f) / 1.5f));
	#endif
	return particlesShadow;
}//
//--------------------------------------------------------------------------------------

float UnpackLightingHeightOffset(in float h) {
	return h * MAX_LIGHTING_HEIGHT_OFFSET_RANGE - MAX_LIGHTING_HEIGHT_OFFSET_MARGIN;
}
//--------------------------------------------------------------------------------------
float3 UnpackLightingColor(in float3 rgb) {
	return rgb * MAX_LIGHTING_COLOR_CHANNEL_VALUE;
}
//--------------------------------------------------------------------------------------
float UnpackLightingRange(in float r) {
	return r * MAX_LIGHTING_RADIUS;
}
//--------------------------------------------------------------------------------------
float3 UnpackXYZDirection(in float2 xzDir, in float heightOffset) {
	const float yUnpackEmpiric = 1.5f;
	float yScale = heightOffset / yUnpackEmpiric;

	float2 xzDirSigned = (xzDir - .5f) * 2.f;
	float yComponent = _sqrt(1.f - dot(xzDirSigned, xzDirSigned)) * yScale;
	return normalize(float3(xzDirSigned.x, yComponent, xzDirSigned.y));
}
//--------------------------------------------------------------------------------------
//float3 GetLightingSumColorAt(in float3 worldPos, in float3 worldNormal, in float heightBase, out float3 dirToLightSum) {
	//float4 lightMapLightingA;
	//float4 lightMapLightingB;
	//GetLightMapLightingAt(worldPos, lightMapLightingA, lightMapLightingB);

	//float lightHeight = heightBase + UnpackLightingHeightOffset(lightMapLightingB.b);
	//float attenRange = UnpackLightingRange(lightMapLightingB.a);

	//// Attenuation is computed with regards to height offset, XZ offset is already embeded to lightColor
	//float heightOffset = lightHeight - worldPos.y;
	//// 2.0 multiplier makes distAtten 1.0 for < attenRange * 0.5 then linearly fades to 0 by attenRange
	//float attenParam = heightOffset / attenRange;
	//float distAtten = saturate((1.f - abs(attenParam)) * 2.f);
	//// the same as : saturate( 1.0 + (1.0 - abs(heightOffset) / (attenRange / 2.0) );	

	//float lightSumIndirection = lightMapLightingA.a;
	//dirToLightSum = normalize(lerp(
	//	UnpackXYZDirection(lightMapLightingB.rg, heightOffset), worldNormal, lightSumIndirection));
	//return UnpackLightingColor(lightMapLightingA.rgb) * distAtten;
//}//
//--------------------------------------------------------------------------------------

void DoDefaultLighting(out LIGHTING_DESC lighting, in SURFACE_DESC surface) {
	float baseHeight = GetTerrainHeight(surface.worldPos.xz);
	//float directIntensity = GetRGBIntensity(g_vSunColor);
	float3 irradianceMultNegY;
	float3 irradianceReflectedNegY;
	if (g_fIsUseGroundmap > 0) {
		float3 groundMap = sampleLevel2D(TX_TCOMMON_GROUNDMAP, 
			(surface.worldPos.xz - g_vTerrainPosData.xy) * g_vTerrainPosData.zw).rgb * 2.f;
		//	float roadsMap = sampleLevel2D(TX_TCOMMON_ROADSMAP, terrainTC).r;
		//	groundMap.rgb = lerp(groundMap.rgb, .25f, roadsMap);
		//}
	
		float tFade = 1.f;		
		#ifndef FORCE_LIGHTMAP_OCCLUSION_LEVEL0
		{
			// only use near ground
			tFade *= 1.f - saturate((surface.worldPos.y - baseHeight - 0.f) / 8.f);
		}
		#endif

		const float groundMult = 2.4f; // approx neg y color (inv) of reflection cube
		irradianceMultNegY = lerp(float3(1, 1, 1), groundMap * groundMult, tFade);
		irradianceReflectedNegY = 0; // not using reflected sunlight

		//SetLightingDebugOutput(lighting, irradianceReflectedNegY);
		//return;
	} else {
		irradianceMultNegY = 1.f;
		irradianceReflectedNegY = 0;
	}
	//float3 dirToLightSum;
	//float3 lightSumColor = GetLightingSumColorAt(surface.worldPos, surface.worldNormal, baseHeight, dirToLightSum);

	//irradianceReflectedNegY *= s_fOcclusionLevel0;
	DoPbrLighting(lighting, surface, irradianceMultNegY, irradianceReflectedNegY/*, lightSumColor, dirToLightSum*/);
	
	//SetLightingDebugOutput(lighting, lighting.directDiffuse);
	//return;
	#ifndef DISABLE_PARTICLES_SHADOWS
	{
		float particlesShadow = GetParticlesShadow(surface.worldPos);
		lighting.directDiffuse *= particlesShadow;
		lighting.directSpecular *= particlesShadow;

		// occlude ambient
		float particlesOcclusion = .75f + particlesShadow * .25f;
		lighting.ambientDiffuse *= particlesOcclusion;
		lighting.ambientSpecular *= particlesOcclusion;
	}
	#endif

	// bounce light
	//#ifdef FORCE_LIGHTMAP_OCCLUSION_LEVEL0
	{
		float3 bounceLight = sampleLevel2D(TX_TCOMMON_LIGHTMAPBOUNCE, 
			(surface.worldPos.xz - g_vVisiblePosData.xy) * g_vVisiblePosData.zw).rgb;

		float tFade = 1.f - saturate((surface.worldPos.y - baseHeight - 0.f) / 4.f);		
#ifdef PERVERTEX_LIGHTING
		// TODO: yet another vertex lighting hack
		const float groundMult = 1.f;
#else
		const float groundMult = .1f;
#endif
		lighting.ambientDiffuse += bounceLight * tFade * groundMult;
	}
	//#endif

	// apply cloaking	
	float cloaking = GetCloakingAt(surface.worldPos.xz);
	cloaking = cloaking * cloaking * cloaking;
	//if (cloaking < 1.f) {
	//	lighting.directDiffuse = dot(lighting.directDiffuse, .33f).xxx;
	//	lighting.directSpecular = dot(lighting.directSpecular, .33f).xxx;
	//	lighting.ambientDiffuse = dot(lighting.ambientDiffuse, .33f).xxx;
	//	lighting.ambientSpecular = dot(lighting.ambientSpecular, .33f).xxx;
	//}
	lighting.directDiffuse *= cloaking;
	lighting.directSpecular *= cloaking;
	lighting.ambientDiffuse *= cloaking;
	lighting.ambientSpecular *= cloaking;
}//
//--------------------------------------------------------------------------------------

float3 GetDefaultSurfaceColor(in SURFACE_DESC surface) {
	float waterDepth;
	float specularMask;
	#if !defined(PERVERTEX_LIGHTING)
		waterDepth = GetWaterDepth(surface.worldPos);
		specularMask = GetSpecularMask(waterDepth);
	#else
		// applied explicitly
		waterDepth = 0.f;
		specularMask = 1.f;
	#endif
	#ifndef FORCE_MAX_SHADOWMAP_FILTER_RADIUS
		// max radius in water
		//s_fShadowmapFilterRadiusMult = lerp(s_fShadowmapFilterRadiusMult, 4.f, waterMask);
		s_fShadowmapFilterRadiusMult += max(waterDepth, 0.f) * 4.f;
	#endif	
	// disable shadowmap in deep water
	s_fShadowmapFadeOutFactor = saturate(waterDepth / 6.f);

	LIGHTING_DESC lighting;
	DoDefaultLighting(lighting, surface);

	// specular mask
	lighting.directSpecular *= specularMask;
	lighting.ambientSpecular *= specularMask;

	float3 color =
		lighting.directDiffuse +
		lighting.directSpecular +
		lighting.ambientDiffuse +
		lighting.ambientSpecular;
	return color;
}//
//--------------------------------------------------------------------------------------

void WeatherParticleUnpack(in float4 packedIntance, in float3 org, 
	in float lifeTime, in float coordRange, out float3 worldPos, out float age, out bool haveCollided) 
{
	worldPos = org + (packedIntance.xyz - .5f) * 2.f * coordRange;
	age = packedIntance.w * 2.f * lifeTime;

	if (age > lifeTime) {
		age -= lifeTime;
		haveCollided = true;
	} else {
		haveCollided = false;
	}
}//
//--------------------------------------------------------------------------------------

void WeatherParticlePack(out float4 packedIntance, in float3 org, 
	in float lifeTime, in float coordRange, in float3 worldPos, in float age, in bool haveCollided)
{
	packedIntance.xyz = (worldPos - org) / coordRange / 2.f + .5f;
	packedIntance.w = saturate(age / lifeTime) * .5f;
	if (haveCollided) {
		packedIntance.w += .5f;
	}
	packedIntance = saturate(packedIntance);
}//
//--------------------------------------------------------------------------------------

float3 GetFakeIrradianceReflection(float wetness, float occlusion) {
	float radianceMult = wetness * pow(occlusion, 4.f) * .15f;
	return sampleLevelCube(
		TX_COMMON_GGXREFLCUBE, _UP, IRRADIANCE_REFL_CUBEMAP_LOD).rgb * radianceMult;
}//
//--------------------------------------------------------------------------------------
 
void ApplyMacroColor(inout SURFACE_DESC surface, in float t = 1.f) {
	const float tilingScale = .01f;

	float3 macro = sampleLevel2D(TX_TCOMMON_MACRO_COLOR, surface.worldPos.xz * tilingScale).rgb;
	surface.albedo.rgb *= lerp(float3(1.f, 1.f, 1.f), macro * 2.f, t);
}//
//--------------------------------------------------------------------------------------

float3 UnpackSimulationWind(in float4 sim) {
	return (sim.rgb - .5f) * MAX_WIND_VELOCITY * 2.f;
}//
//--------------------------------------------------------------------------------------
float4 PackSimulationWind(in float3 wind) {
	return float4(saturate(wind / MAX_WIND_VELOCITY / 2.f + .5f), 0);
}//
//--------------------------------------------------------------------------------------

float3 GetDynamicWindAt(in float3 worldPos) {
#ifdef _EDITOR
	return float3(0, 0, 0);
#else
	const float3 simulationSize =
		float3(WIND_SIMULATION_SIZE_XZ, WIND_SIMULATION_SIZE_Y, WIND_SIMULATION_SIZE_XZ) * WIND_SIMULATION_TEXEL_SIZE;

	float3 windSimulationTC = (worldPos - (g_vWindSimulationCenter - simulationSize * .5f)) / simulationSize;
	return UnpackSimulationWind(sampleLevel3D(TX_TCOMMON_WIND_SIMULATION, windSimulationTC.xzy));
#endif
}//
//--------------------------------------------------------------------------------------

float3 GetWindOffset(float3 worldPos, float3 worldPivot, in float windMask, in float ambientWindMult, in float stiffness = 0) {
	const float ambientOffsetScale = .025f;
	const float ambientWindSpeed = .75f;
	//const float waterDisturbStrength = 4.f;
	//const float waterFlowStrength = 4.f;

	const float bend = 2.f;
	const float stretch = 0.25f;

	float3 samplePos = lerp(worldPos, worldPivot, stiffness);
	float3 offset = -AMBIENT_WIND_DIRECTION * ambientOffsetScale;
	//float3 offsetWater = 0;
	{
		const float scale = .2f;
		const float density = .02f;
		float3 noiseTC = samplePos - AMBIENT_WIND_DIRECTION * ambientWindSpeed * g_fSceneTime;

		// sum 4 octaves
		int i;
		for (i = 0; i < 4; i++) {
			float densityOctave = pow(2.f, i);//i + 1.f;				
			offset += (sampleLevel3D(TX_TCOMMON_WIND_NOISE, noiseTC * densityOctave * density).rgb - .5f) / densityOctave * scale;
		}
	}
	//#ifndef _EDITOR
	//	float2 waterSimTC = (worldPos.xz - g_vVisiblePosData.xy) * g_vVisiblePosData.zw;
	//	float4 waterSim1 = sampleLevel2D(TX_TCOMMON_WATERSIM1, waterSimTC);
	//	float4 waterSim2 = sampleLevel2D(TX_TCOMMON_WATERSIM2, waterSimTC);
	//	float2 waterFlow = UnpackNormal2(WATER_SIM2_DYNAMIC_FLOW(waterSim2)) * waterFlowStrength;
	//	offsetWater += offset * (WATER_SIM1_DISTURBANCE(waterSim1) * waterDisturbStrength + length(waterFlow));
	//#endif
	//float2 waterFlow = 0;
	offset *= ambientWindMult;

	const float scaleDynamicWind = .5f;
	{
		float3 wind = GetDynamicWindAt(samplePos);
		//#ifndef _EDITOR
		//	wind.x += waterFlow.x;
		//	wind.z += waterFlow.y;
		//#endif
		float windLength = length(wind);

		float2 dir1, dir2;
		float angT;
		float lin0, lin1, linT;
		DiscretizeWaves(wind.xz, windLength / MAX_WIND_VELOCITY, dir1, dir2, angT, lin0, lin1, linT);

		float2 angTC1 = float2(
			dot(float2(+dir1.x, +dir1.y), samplePos.xz),
			dot(float2(-dir1.y, +dir1.x), samplePos.xz));
		float2 angTC2 = float2(
			dot(float2(+dir2.x, +dir2.y), samplePos.xz),
			dot(float2(-dir2.y, +dir2.x), samplePos.xz));

		float2 tcScroll = float2(-20.f, 0) * g_fSceneTime + float2(0.f, 23.723f);
		const float tcScale = .02f;

		float3 noise0, noise1;
		noise0 = lerp(
			sampleLevel3D(TX_TCOMMON_WIND_NOISE, float3((angTC1 + tcScroll * lin0) * tcScale, samplePos.y).xzy).rgb,
			sampleLevel3D(TX_TCOMMON_WIND_NOISE, float3((angTC2 + tcScroll * lin0) * tcScale, samplePos.y).xzy).rgb, angT);
		noise1 = lerp(
			sampleLevel3D(TX_TCOMMON_WIND_NOISE, float3((angTC1 + tcScroll * lin1) * tcScale, samplePos.y).xzy).rgb,
			sampleLevel3D(TX_TCOMMON_WIND_NOISE, float3((angTC2 + tcScroll * lin1) * tcScale, samplePos.y).xzy).rgb, angT);
		float3 noise = lerp(noise0, noise1, linT);

		// sum with ambient wind
		offset += (-wind * .25f + (noise - .5f) * windLength) * scaleDynamicWind;
	}
	float3 l = length(worldPos - worldPivot);
	float3 offsetPosStretched = worldPos + offset * pow(windMask, bend);
	float3 offsetPosFixed = worldPivot + normalize(offsetPosStretched - worldPivot) * l;

	return worldPos - lerp(offsetPosFixed, offsetPosStretched, stretch);// +offsetWater;
}//
//--------------------------------------------------------------------------------------

// forward declaration
WATERTYPE_PARAMS GetWaterTypeParamsByIndex(uint n);
void GetWaterTypeParams(out WATERTYPE_PARAMS waterParams,
	in _texture2D texIndices, in _texture2D texBlend, in float2 worldPosXZ)
{
	float2 terrainTC = (worldPosXZ - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;

	// types are per-subblock map so it is mapped correctly
	float2 typesIndices = sampleLevel2D(texIndices, terrainTC).rg;
	// blends is per-sublock-vertex map so map it properly
	float typesBlend = sampleLevel2D(texBlend, terrainTC *
		(1.f - TERRAIN_SUBBLOCK_SIZE * g_vTerrainPosData.zw) +
		TERRAIN_SUBBLOCK_SIZE * .5f * g_vTerrainPosData.zw).r;

	WATERTYPE_PARAMS type0 = GetWaterTypeParamsByIndex(typesIndices.x * 255.f);
	WATERTYPE_PARAMS type1 = GetWaterTypeParamsByIndex(typesIndices.y * 255.f);

	waterParams = (WATERTYPE_PARAMS)0;
	waterParams.vDiffuse = lerp(type0.vDiffuse, type1.vDiffuse, typesBlend);
	waterParams.vFoam = lerp(type0.vFoam, type1.vFoam, typesBlend);
	waterParams.vRefraction = lerp(type0.vRefraction, type1.vRefraction, typesBlend);
	waterParams.fTintBias = lerp(type0.fTintBias, type1.fTintBias, typesBlend);
	waterParams.fTintDepth = lerp(type0.fTintDepth, type1.fTintDepth, typesBlend);
	waterParams.fOpacityBias = lerp(type0.fOpacityBias, type1.fOpacityBias, typesBlend);
	waterParams.fOpacityDepth = lerp(type0.fOpacityDepth, type1.fOpacityDepth, typesBlend);
}//
//--------------------------------------------------------------------------------------

#endif //__cplusplus

#endif //_TERRAIN_COMMON_H
//EOF