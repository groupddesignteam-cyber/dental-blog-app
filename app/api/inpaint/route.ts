import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    try {
        const { image, mask } = await req.json()

        if (!image || !mask) {
            return NextResponse.json({ error: '이미지와 마스크 데이터가 필요합니다.' }, { status: 400 })
        }

        const hfToken = process.env.HUGGINGFACE_API_KEY
        if (!hfToken) {
            return NextResponse.json({
                error: '서버에 HUGGINGFACE_API_KEY 환경변수가 설정되지 않았습니다. .env.local 파일을 확인해주세요.'
            }, { status: 500 })
        }

        // Base64 문자열에서 실제 이미지 데이터 추출
        const imageBuffer = Buffer.from(image.split(',')[1], 'base64')
        const maskBuffer = Buffer.from(mask.split(',')[1], 'base64')

        // 빈 배경으로 채워넣기 위한 프롬프트
        const prompt = "clear empty background, seamless integration, high quality, matching surrounding textures"

        const formData = new FormData()
        formData.append('inputs', prompt)
        formData.append('image', new Blob([imageBuffer], { type: 'image/png' }))
        formData.append('mask_image', new Blob([maskBuffer], { type: 'image/png' }))

        // Hugging Face 서버리스 인퍼런스 호출 (Stable Diffusion 2 Inpainting 모델)
        const response = await fetch(
            'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-inpainting',
            {
                headers: {
                    Authorization: `Bearer ${hfToken}`,
                },
                method: 'POST',
                body: formData,
            }
        )

        if (!response.ok) {
            const errText = await response.text()
            console.error('Hugging Face API Error:', errText)
            return NextResponse.json({ error: `Hugging Face API 에러 발생: ${errText}` }, { status: response.status })
        }

        // 결과 이미지는 ArrayBuffer 형태로 바로 전달됨
        const arrayBuffer = await response.arrayBuffer()
        const base64Str = Buffer.from(arrayBuffer).toString('base64')
        const responseDataUrl = `data:image/jpeg;base64,${base64Str}`

        return NextResponse.json({ erasedImage: responseDataUrl })

    } catch (error: any) {
        console.error('Inpaint API Exception:', error)
        return NextResponse.json({ error: error.message || '알 수 없는 서버 오류' }, { status: 500 })
    }
}
