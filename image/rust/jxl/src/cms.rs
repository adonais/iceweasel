// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

use std::sync::LazyLock;

use jxl::api::{JxlCms, JxlCmsTransformer, JxlColorEncoding, JxlColorProfile};
use jxl::error::{Error, Result};
use qcms::{DataType, Intent, Profile, Transform};

pub enum RenderingIntent {
    Intent(qcms::Intent),
    FromImageProfile,
}

fn get_rendering_intent(rendering_intent: &RenderingIntent, profile: &Profile) -> Intent {
    match rendering_intent {
        RenderingIntent::Intent(intent) => *intent,
        RenderingIntent::FromImageProfile => profile.rendering_intent(),
    }
}

// Initialized once, then shared across all decoder instances.
static SRGB_PROFILE: LazyLock<Box<Profile>> = LazyLock::new(Profile::new_sRGB);

// Always converts to sRGB, matching the output profile set in JxlApiDecoder::new.
pub struct QcmsCms {
    pub rendering_intent: RenderingIntent,
}

fn get_data_type(profile: &JxlColorProfile) -> DataType {
    match profile {
        JxlColorProfile::Simple(encoding) => match encoding {
            JxlColorEncoding::RgbColorSpace { .. } | JxlColorEncoding::XYB { .. } => DataType::RGB8,
            JxlColorEncoding::GrayscaleColorSpace { .. } => DataType::Gray8,
        },
        JxlColorProfile::Icc(icc) => {
            if icc.len() >= 20 {
                match &icc[16..20] {
                    b"CMYK" => DataType::CMYK,
                    b"GRAY" => DataType::Gray8,
                    // XYB gets converted to RGB before the CMS stage in the jxl-rs render pipe.
                    _ => DataType::RGB8,
                }
            } else {
                DataType::RGB8
            }
        }
    }
}

fn channels_for_data_type(dt: DataType) -> usize {
    match dt {
        DataType::Gray8 => 1,
        DataType::RGB8 => 3,
        DataType::CMYK => 4,
        _ => 3,
    }
}

// jxl-rs only calls initialize_transforms when the input color profile
// differs from the requested output profile, so the ICC creation cost here
// is only paid when conversion is actually needed. Duplicating that check
// here is not worth the complexity.
impl JxlCms for QcmsCms {
    fn initialize_transforms(
        &self,
        // Number of parallel transforms that may run concurrently.
        num_transforms: usize,
        max_pixels_per_transform: usize,
        input: JxlColorProfile,
        _output: JxlColorProfile,
        _intensity_target: f32,
    ) -> Result<(usize, Vec<Box<dyn JxlCmsTransformer + Send>>)> {
        let in_type = get_data_type(&input);
        let out_type = DataType::RGB8;

        let input_icc = input.try_as_icc().ok_or(Error::InvalidIccStream)?;
        let input_profile =
            Profile::new_from_slice(&input_icc, false).ok_or(Error::InvalidIccStream)?;

        let in_channels = channels_for_data_type(in_type);
        let out_channels = 3;

        let mut transformers: Vec<Box<dyn JxlCmsTransformer + Send>> =
            Vec::with_capacity(num_transforms);
        for _ in 0..num_transforms {
            let transform = Transform::new_to(
                &input_profile,
                &SRGB_PROFILE,
                in_type,
                out_type,
                get_rendering_intent(&self.rendering_intent, &input_profile),
            )
            .ok_or(Error::InvalidIccStream)?;
            transformers.push(Box::new(QcmsTransformer {
                transform,
                in_type,
                in_channels,
                out_channels,
                input_buf: vec![
                    0u8;
                    max_pixels_per_transform
                        .checked_mul(in_channels)
                        .ok_or(Error::ArithmeticOverflow)?
                ],
                output_buf: vec![
                    0u8;
                    max_pixels_per_transform
                        .checked_mul(out_channels)
                        .ok_or(Error::ArithmeticOverflow)?
                ],
            }));
        }

        Ok((out_channels, transformers))
    }
}

struct QcmsTransformer {
    transform: Transform,
    in_type: DataType,
    in_channels: usize,
    out_channels: usize,
    input_buf: Vec<u8>,
    output_buf: Vec<u8>,
}

// TODO: Implement the u8 interface to JxlCmsTransformer when jxl-rs adds it,
// to avoid the f32->u8->f32 round-trip conversions.
impl JxlCmsTransformer for QcmsTransformer {
    fn do_transform(&mut self, input: &[f32], output: &mut [f32]) -> Result<()> {
        let num_pixels = input.len() / self.in_channels;
        let input_bytes = num_pixels * self.in_channels;
        let output_bytes = num_pixels * self.out_channels;

        let input_u8 = &mut self.input_buf[..input_bytes];
        if self.in_type == DataType::CMYK {
            for (i, &v) in input[..input_bytes].iter().enumerate() {
                input_u8[i] = f32_to_u8_inverted(v);
            }
        } else {
            for (i, &v) in input[..input_bytes].iter().enumerate() {
                input_u8[i] = f32_to_u8(v);
            }
        }

        let output_u8 = &mut self.output_buf[..output_bytes];
        self.transform.convert(input_u8, output_u8);

        for (i, &v) in output_u8.iter().enumerate() {
            output[i] = v as f32 / 255.0;
        }
        Ok(())
    }

    // jxl-rs tries inplace first; falls back to do_transform when channel
    // counts differ (e.g. CMYK 4 -> RGB 3).
    fn do_transform_inplace(&mut self, inout: &mut [f32]) -> Result<()> {
        if self.in_channels != self.out_channels {
            return Err(Error::CmsChannelCountIncrease {
                in_channels: self.in_channels,
                out_channels: self.out_channels,
            });
        }

        let num_pixels = inout.len() / self.in_channels;
        let buf_len = num_pixels * self.in_channels;
        let buf = &mut self.input_buf[..buf_len];

        for (i, &v) in inout[..buf_len].iter().enumerate() {
            buf[i] = f32_to_u8(v);
        }

        self.transform.apply(buf);

        for (i, &v) in buf.iter().enumerate() {
            inout[i] = v as f32 / 255.0;
        }
        Ok(())
    }
}

fn f32_to_u8(v: f32) -> u8 {
    (v * 255.0).clamp(0.0, 255.0) as u8
}

fn f32_to_u8_inverted(v: f32) -> u8 {
    ((1.0 - v) * 255.0).clamp(0.0, 255.0) as u8
}
