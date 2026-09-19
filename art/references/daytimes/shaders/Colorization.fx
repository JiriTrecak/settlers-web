//--------------------------------------------------------------------------------------
// File:		Colorization.fx
// Description:	
// Date:		5/10/23 12:22 PM
//--------------------------------------------------------------------------------------

#include "../Common.fxh"
#include "../Lighting.fxh"

//
#include "Shared.fxh"
#include "TerrainCommon.fxh"

//--------------------------------------------------------------------------------------
// Global variables
//--------------------------------------------------------------------------------------

DECLARE_TEX2D(TEX_REG_0, TX_COLORIZATION_BB, SMP_CLAMP_POINT);
DECLARE_TEX2D(TEX_REG_1, TX_COLORIZATION_SMOKE, SMP_WRAP_LINEAR);

CONST_BUFFER_BEGIN(CB_INSTANCE, SCOURING_COLORIZATION)
	DECLARE_FLOAT4(g_vColor, EC_COLORIZATION_COLOR)
	DECLARE_FLOAT2(g_vCenter, EC_COLORIZATION_CENTER)
	DECLARE_FLOAT(g_fRadialFactorScale, EC_COLORIZATION_RADIAL_FACTOR_SCALE)
	DECLARE_FLOAT(g_fRadialFactorPow, EC_COLORIZATION_RADIAL_FACTOR_POW)
	DECLARE_FLOAT(g_fAdditiveComponentMult, EC_COLORIZATION_ADDITIVE_COMPONENT_MULT)
	DECLARE_FLOAT(g_fSmokeOverlayIntensity, EC_COLORIZATION_SMOKE_OVERLAY_INTENSITY)
CONST_BUFFER_END;

//--------------------------------------------------------------------------------------
// Shader code
//--------------------------------------------------------------------------------------
#ifndef __cplusplus

float4 colorizePS(in float2 tc : TEXCOORD0) : SV_Target0
{
	float radialFactor = length((tc - g_vCenter) * float2(1.f, 1.f) * g_fRadialFactorScale);
	float flareFactor = saturate(1.f - 1.f * pow(radialFactor, g_fRadialFactorPow));
	float4 result = sampleLevel2D(TX_COLORIZATION_BB, tc);

	float3 frustumViewDir = lerp(
		lerp(g_frustumDirs[0].xyz, g_frustumDirs[1].xyz, 1 - tc.y),
		lerp(g_frustumDirs[3].xyz, g_frustumDirs[2].xyz, 1 - tc.y),
		tc.x);
	//float3 samplePos = g_vEyePos + frustumViewDir * 64.f;
	//float d = g_vEyePos.y - 15.f;
	//float3 samplePos = g_vEyePos + frustumViewDir * d / -frustumViewDir.y;

	float depthCorrection = 1.f / dot(frustumViewDir, g_vViewDir.xyz);
	float screenDepth = sampleLevel2Dex(TX_COMMON_Z, tc, SMP_CLAMP_POINT).r;
	float3 samplePos = g_vEyePos + frustumViewDir * screenDepth * depthCorrection;

	// add smoke mask
	if (screenDepth < 256.f) {
		// dont apply to sky
		float2 smokeTC = samplePos.xz * .0075f;
		smokeTC += AMBIENT_WIND_DIRECTION.xz * g_fSceneTime * .01f;

		float3 smoke = sample2D(TX_COLORIZATION_SMOKE, smokeTC).rgb;
		//return float4(smoke, 1);
		result.rgb += smoke * .1f * g_fSmokeOverlayIntensity;
	}

	float cloaking = GetCloakingAt(samplePos.xz);
	// add flare effect
	float3 flare = g_vColor.rgb * flareFactor * saturate((cloaking - .5f) / .5f);
	result.rgb += flare * g_fAdditiveComponentMult;
	result.rgb = BlendDodge(result.rgb, flare * 1.f);

	// desaturate
	float luminance = GetRGBIntensity(result.rgb);
	result.rgb = lerp(luminance.xxx, result.rgb, saturate((cloaking - .5f) / .5f + .25f));
	return result;
}//
//-----------------------------------------------------------------------------

#endif //__cplusplus

//--------------------------------------------------------------------------------------
// Techniques
//--------------------------------------------------------------------------------------
DECLARE_TECHNIQUE(Colorize, passThroughTexVS, colorizePS);


//EOF