//--------------------------------------------------------------------------------------
// File:		PostProcess.fx
// Description:	
// Date:		08/04/11 12:39 AM
//--------------------------------------------------------------------------------------

#include "../Common.fxh"

//--------------------------------------------------------------------------------------
// Global variables
//--------------------------------------------------------------------------------------

DECLARE_TEX2D(TEX_REG_0, TX_POSTPROCESS_BB, SMP_CLAMP_POINT);
//DECLARE_TEX2D_UINT2(TEX_REG_1, TX_POSTPROCESS_STENCIL);
DECLARE_TEX3D(TEX_REG_2, TX_POSTPROCESS_LUT1, SMP_CLAMP_LINEAR);
DECLARE_TEX3D(TEX_REG_3, TX_POSTPROCESS_LUT2, SMP_CLAMP_LINEAR);
DECLARE_TEX2D(TEX_REG_4, TX_POSTPROCESS_FLARES, SMP_CLAMP_LINEAR);
DECLARE_TEX2D(TEX_REG_5, TX_POSTPROCESS_CAMERABOKEH, SMP_CLAMP_LINEAR);
DECLARE_TEX2D(TEX_REG_6, TX_POSTPROCESS_SKYBLOOM, SMP_CLAMP_LINEAR);

CONST_BUFFER_BEGIN(CB_INSTANCE, SCOURING_POSTPROCESS)	
	DECLARE_FLOAT(g_fBrightness, EC_POSTPROCESS_BRIGHTNESS)
	DECLARE_FLOAT(g_fContrast, EC_POSTPROCESS_CONTRAST)
	DECLARE_FLOAT(g_fSaturation, EC_POSTPROCESS_SATURATION)
	DECLARE_FLOAT(g_fVignette, EC_POSTPROCESS_VIGNETTE)
	DECLARE_FLOAT(g_fBlendLUT, EC_POSTPROCESS_BLENDLUT)	
CONST_BUFFER_END;

//--------------------------------------------------------------------------------------
// Shader code
//--------------------------------------------------------------------------------------
#ifndef __cplusplus

//-----------------------------------------------------------------------------
float4 finalComposePS(in float2 tc : TEXCOORD0) : SV_Target0
{
	float4 result = sampleLevel2D(TX_POSTPROCESS_BB, tc);
	{
		float3 bokeh = sample2D(TX_POSTPROCESS_CAMERABOKEH, tc).rgb;

		float2 tcReflected = (.5f - tc) * 2.f;
		tcReflected = tcReflected * length(tcReflected) / 2.f + .5f;

		float3 flares = pow(sample2D(TX_POSTPROCESS_FLARES, tcReflected).rgb, 1.f);
		flares += pow(sample2D(TX_POSTPROCESS_FLARES, tc).rgb, 1.f);
		//float3 flares = pow(sample2D(TX_POSTPROCESS_FLARES, screenTC).rgb, 1.f);		
//#	ifdef VIGNETTE
//		flares *= 1.f - g_fParamVignette * .5f;
//#	endif
		//return float4(flares * 2, 1);
		result.rgb += bokeh * flares;
		//return float4(flares * 32, 1);
	}

	result.rgb = lerp(
		sample3D(TX_POSTPROCESS_LUT1, result.rgb).rgb,
		sample3D(TX_POSTPROCESS_LUT2, result.rgb).rgb,
		g_fBlendLUT);
#ifdef SKY_BLOOM
	{
		float4 skyBloom = sample2D(TX_POSTPROCESS_SKYBLOOM, tc);

		// add sky bloom from reflected flares
	//	skyBloom.r += 
	//		saturate(GetRGBIntensity(sample2D(TX_POSTPROCESS_FLARES, tcReflected).rgb) - .01f) * 4.f;

		//return float4(lerp(result.rgb, skyBloom.rrr, .95f), 1.f);
		//return float4(skyBloom.rrr, 1);
		//return float4(skyBloom.gba, 1);
		result.rgb = lerp(result.rgb, BlendSoftLight(result.rgb, skyBloom.gba), skyBloom.r * 2.f);
	}
#endif
	{
		float radialFactor = length((tc - .5f) * float2(1.f, .8f));
		float vignetteFactor = 4.f * pow(radialFactor, 3.f);
		result *= 1.f - vignetteFactor * g_fVignette * .6f;
	}
	{
		float luminance = GetRGBIntensity(result.rgb);
		result.rgb = lerp(luminance.xxx, result.rgb, g_fSaturation);
	}
	result = result * g_fContrast + g_fBrightness;
	return result;
}//
//-----------------------------------------------------------------------------

#endif //__cplusplus

//--------------------------------------------------------------------------------------
// Techniques
//--------------------------------------------------------------------------------------
DECLARE_TECHNIQUE(FinalCompose, passThroughTexVS, finalComposePS);


//EOF